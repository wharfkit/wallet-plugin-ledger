/// <reference types="node" />

import {
    AbstractWalletPlugin,
    Checksum256,
    LoginContext,
    PermissionLevel,
    ResolvedSigningRequest,
    Signature,
    TransactContext,
    WalletPlugin,
    WalletPluginConfig,
    WalletPluginLoginResponse,
    WalletPluginMetadata,
    WalletPluginSignResponse,
} from '@wharfkit/session'

// Import Ledger Transport classes
import TransportWebUSB from '@ledgerhq/hw-transport-webusb'
import TransportWebHID from '@ledgerhq/hw-transport-webhid'
import TransportWebBLE from '@ledgerhq/hw-transport-web-ble'
import TransportNodeHID from '@ledgerhq/hw-transport-node-hid'
import Transport from '@ledgerhq/hw-transport'

// Re-export Transport libraries
export {TransportWebUSB, TransportWebHID, TransportWebBLE, TransportNodeHID}

// Ledger app communication constants
const CLA = 0xd4
const INS = {
    GET_APP_CONFIGURATION: 0x01,
    GET_PUBLIC_KEY: 0x02,
    SIGN_TRANSACTION: 0x04,
}

// Error messages
const ERROR_MESSAGES = {
    DEVICE_NOT_CONNECTED: 'Ledger device not connected',
    APP_NOT_OPEN: 'EOS application not open on Ledger device',
    USER_REJECTED: 'Transaction was rejected by the user',
    TIMEOUT: 'Operation timed out',
}

// Config interface for the Ledger wallet plugin
export interface WalletPluginLedgerOptions {
    // Optional parameters
    transport?: Transport
    transportType?: 'WebUSB' | 'WebHID' | 'WebBLE' | 'NodeHID'
    timeout?: number
}

// Wrapper for Ledger responses
interface LedgerResponse {
    data: Buffer
}

export class WalletPluginLedger extends AbstractWalletPlugin implements WalletPlugin {
    /**
     * The logic configuration for the wallet plugin.
     */
    readonly config: WalletPluginConfig = {
        // Should the user interface display a chain selector?
        requiresChainSelect: true,

        // Should the user interface display a permission selector?
        requiresPermissionSelect: true,
    }

    /**
     * The metadata for the wallet plugin to be displayed in the user interface.
     */
    readonly metadata: WalletPluginMetadata = WalletPluginMetadata.from({
        name: 'Ledger Hardware Wallet',
        description: 'Use your Ledger hardware wallet to sign transactions securely.',
        logo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NDggNTEyIj48IS0tIUZvbnQgQXdlc29tZSBQcm8gNi40LjAgYnkgQGZvbnRhd2Vzb21lIC0gaHR0cHM6Ly9mb250YXdlc29tZS5jb20gTGljZW5zZSAtIGh0dHBzOi8vZm9udGF3ZXNvbWUuY29tL2xpY2Vuc2UgKENvbW1lcmNpYWwgTGljZW5zZSkgQ29weXJpZ2h0IDIwMjMgRm9udGljb25zLCBJbmMuIC0tPjxwYXRoIGQ9Ik00MDAgMjU2YzAgMTcuNy0xNC4zIDMyLTMyIDMycy0zMi0xNC4zLTMyLTMyIC0zMi0xNC4zLTMyLTMyIDMyIDE0LjMgMzIgMzJoNTZsLTMyIDE5MkgzMlYzMmgyODhMMzQ0IDIyNGg1NnpNNDQgMEMyOS43IDAgMTguMSAxMi44IDE2LjEgMjcuMUwwIDMwNy4yYy0uNiA0LjUuOCA5IDMuOCAxMi42QzcuMiAzMjMuMyAxMS41IDMyNiAxNiAzMjZoNDE2YzQuNSAwIDguOC0yLjcgMTAuNy02LjIgMy01LjYgNC4xLTguMSAzLjgtMTIuNkw0MzEuOSAyNy4xQzQyOS45IDEyLjggNDE4LjMgMCA0MDQgMEg0NHoiLz48L3N2Zz4=',
        homepage: 'https://www.ledger.com',
        download: 'https://www.ledger.com/ledger-live',
    })

    private transport?: Transport
    private transportType: 'WebUSB' | 'WebHID' | 'WebBLE' | 'NodeHID'
    private timeout: number

    /**
     * Constructor for the Ledger wallet plugin
     */
    constructor(options: WalletPluginLedgerOptions = {}) {
        super()
        this.transport = options.transport
        this.transportType = options.transportType || 'WebUSB'
        this.timeout = options.timeout || 30000 // Default 30 seconds timeout
    }

    /**
     * A unique string identifier for this wallet plugin.
     */
    get id(): string {
        return 'wallet-plugin-ledger'
    }

    /**
     * Create or get the transport instance based on the transport type
     */
    private async getTransport(): Promise<Transport> {
        if (this.transport) {
            return this.transport
        }

        try {
            switch (this.transportType) {
                case 'WebUSB':
                    return await TransportWebUSB.create()
                case 'WebHID':
                    return await TransportWebHID.create()
                case 'WebBLE':
                    return await TransportWebBLE.create()
                case 'NodeHID':
                    return await TransportNodeHID.create()
                default:
                    return await TransportWebUSB.create()
            }
        } catch (error) {
            throw new Error(ERROR_MESSAGES.DEVICE_NOT_CONNECTED)
        }
    }

    /**
     * Helper function to wrap a buffer in a LedgerResponse format
     */
    private wrapResponse(buffer: Buffer): LedgerResponse {
        return {data: buffer}
    }

    /**
     * Get the app configuration from the Ledger device
     */
    private async getAppConfiguration(transport: Transport): Promise<{version: string}> {
        try {
            const responseBuffer = await transport.send(CLA, INS.GET_APP_CONFIGURATION, 0x00, 0x00)
            const response = this.wrapResponse(responseBuffer)
            const version = `${response.data[0]}.${response.data[1]}.${response.data[2]}`
            return {version}
        } catch (error) {
            throw new Error(ERROR_MESSAGES.APP_NOT_OPEN)
        }
    }

    /**
     * Get a public key from the Ledger device
     */
    private async getPublicKey(
        transport: Transport,
        bip32Path: string,
        display: boolean = false
    ): Promise<{publicKey: string}> {
        const paths = bip32Path.split('/')
        const buffer = Buffer.alloc(1 + paths.length * 4)
        buffer[0] = paths.length

        paths.forEach((element, index) => {
            let value = parseInt(element, 10)
            if (isNaN(value)) {
                value = parseInt(element.replace("'", ''), 10) | 0x80000000
            }
            buffer.writeUInt32BE(value, 1 + 4 * index)
        })

        const p1 = display ? 0x01 : 0x00
        const responseBuffer = await transport.send(CLA, INS.GET_PUBLIC_KEY, p1, 0x00, buffer)
        const response = this.wrapResponse(responseBuffer)
        const keyLength = response.data[0]
        const publicKey = response.data.slice(1, 1 + keyLength).toString('hex')

        return {publicKey}
    }

    /**
     * Sign a transaction with the Ledger device
     */
    private async signTransaction(
        transport: Transport,
        bip32Path: string,
        transactionData: Buffer
    ): Promise<{signature: string}> {
        const paths = bip32Path.split('/')
        const pathBuffer = Buffer.alloc(1 + paths.length * 4)
        pathBuffer[0] = paths.length

        paths.forEach((element, index) => {
            let value = parseInt(element, 10)
            if (isNaN(value)) {
                value = parseInt(element.replace("'", ''), 10) | 0x80000000
            }
            pathBuffer.writeUInt32BE(value, 1 + 4 * index)
        })

        // First, send the path
        await transport.send(CLA, INS.SIGN_TRANSACTION, 0x00, 0x00, pathBuffer)

        // Send transaction data in chunks of 255 bytes
        const MAX_CHUNK_SIZE = 255
        let offset = 0

        while (offset < transactionData.length) {
            const chunkSize = Math.min(MAX_CHUNK_SIZE, transactionData.length - offset)
            const p1 = offset + chunkSize === transactionData.length ? 0x80 : 0x00
            const chunk = transactionData.slice(offset, offset + chunkSize)

            const responseBuffer = await transport.send(CLA, INS.SIGN_TRANSACTION, p1, 0x00, chunk)

            if (p1 === 0x80) {
                // This is the last chunk, response contains the signature
                const response = this.wrapResponse(responseBuffer)
                const sigLength = response.data[0]
                const signature = response.data.slice(1, 1 + sigLength).toString('hex')
                return {signature: 'SIG_K1_' + signature}
            }

            offset += chunkSize
        }

        throw new Error('Failed to sign transaction')
    }

    /**
     * Performs the wallet logic required to login and return the chain and permission level to use.
     */
    async login(context: LoginContext): Promise<WalletPluginLoginResponse> {
        try {
            // Get the transport instance
            const transport = await this.getTransport()

            // Check if the EOS app is open on the device
            await this.getAppConfiguration(transport)

            // BIP32 path for EOS (modify according to needed derivation path)
            const path = "44'/194'/0'/0/0"

            // Display public key on device and get it
            const {publicKey} = await this.getPublicKey(transport, path, true)
            console.log('Ledger publicKey:', publicKey)

            // For simplicity, this example uses a placeholder chain and permission
            // In a real implementation, you would:
            // 1. Get the account associated with this public key from the blockchain
            // 2. Let the user select the permission to use

            // If a chain or actor is already provided in the context, use it
            const chainId = '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d'
            const chain = context.chain
                ? Checksum256.from(context.chain.id.toString())
                : Checksum256.from(chainId)

            // In a real implementation, you would determine the actual permission level
            // associated with the public key on the blockchain
            const permissionLevel = PermissionLevel.from('ledgeraccount@active')

            // Close the transport
            await transport.close()

            return {
                chain,
                permissionLevel,
            }
        } catch (error) {
            // Handle errors
            if (error instanceof Error) {
                throw error
            }
            throw new Error('Failed to login with Ledger device')
        }
    }

    /**
     * Performs the wallet logic required to sign a transaction and return the signature.
     */
    async sign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        try {
            // Get the transport instance
            const transport = await this.getTransport()

            // Check if the EOS app is open on the device
            await this.getAppConfiguration(transport)

            // BIP32 path for EOS (modify according to needed derivation path)
            const path = "44'/194'/0'/0/0"

            // Convert transaction to binary format
            const serializedTransaction = resolved.serializedTransaction
            const transactionBuffer = Buffer.from(serializedTransaction)

            // Sign the transaction
            const {signature} = await this.signTransaction(transport, path, transactionBuffer)

            // Close the transport
            await transport.close()

            return {
                signatures: [Signature.from(signature)],
            }
        } catch (error) {
            // Handle errors
            if (error instanceof Error) {
                throw error
            }
            throw new Error('Failed to sign transaction with Ledger device')
        }
    }
}
