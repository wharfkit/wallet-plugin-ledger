/// <reference types="node" />

import {assert} from 'chai'
import {PermissionLevel, SessionKit} from '@wharfkit/session'
import {
    mockChainDefinition,
    mockPermissionLevel,
    mockSessionKitArgs,
    mockSessionKitOptions,
} from '@wharfkit/mock-data'

import {WalletPluginLedger, Transport} from '$lib'

// Create a mock Transport to use in tests
class MockTransport implements Transport {
    async send(cla: number, ins: number, p1: number, p2: number, data?: Buffer): Promise<{ data: Buffer }> {
        // Mock responses based on instruction code
        switch (ins) {
            case 0x01: // GET_APP_CONFIGURATION
                return { data: Buffer.from([1, 0, 0]) } // Version 1.0.0
            case 0x02: // GET_PUBLIC_KEY
                {
                    // Return a sample EOS public key
                    const publicKey = 'PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63'
                    const keyBuffer = Buffer.from(publicKey)
                    const result = Buffer.alloc(1 + keyBuffer.length)
                    result[0] = keyBuffer.length
                    keyBuffer.copy(result, 1)
                    return { data: result }
                }
            case 0x04: // SIGN_TRANSACTION
                if (p1 === 0x80) {
                    // Last chunk, return a mock signature
                    const signature = 'SIG_K1_KfqBXGdSRnVgZbAXyL9hEYbAvrZjcaxUCenD7Z3aX6yzf6MEyc4Cy3ywToD4j3SKkzSg7L1uvRUirEPHwAwrbg5c9z27Z3'
                    const sigBuffer = Buffer.from(signature.substring(7)) // Remove SIG_K1_ prefix
                    const result = Buffer.alloc(1 + sigBuffer.length)
                    result[0] = sigBuffer.length
                    sigBuffer.copy(result, 1)
                    return { data: result }
                }
                return { data: Buffer.from([]) } // Not the last chunk
            default:
                throw new Error(`Unsupported instruction: ${ins}`)
        }
    }

    async close(): Promise<void> {
        // No-op for mock
    }
}

suite('wallet plugin', function () {
    test('login and sign', async function () {
        const mockTransport = new MockTransport()
        
        const kit = new SessionKit(
            {
                ...mockSessionKitArgs,
                walletPlugins: [new WalletPluginLedger({ transport: mockTransport })],
            },
            mockSessionKitOptions
        )
        const {session} = await kit.login({
            chain: mockChainDefinition.id,
            permissionLevel: mockPermissionLevel,
        })
        assert.isTrue(session.chain.equals(mockChainDefinition))
        assert.isTrue(session.actor.equals(PermissionLevel.from(mockPermissionLevel).actor))
        assert.isTrue(
            session.permission.equals(PermissionLevel.from(mockPermissionLevel).permission)
        )
        const result = await session.transact(
            {
                action: {
                    authorization: [PermissionLevel.from(mockPermissionLevel)],
                    account: 'eosio.token',
                    name: 'transfer',
                    data: {
                        from: PermissionLevel.from(mockPermissionLevel).actor,
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit/session wallet plugin ledger',
                    },
                },
            },
            {
                broadcast: false,
            }
        )
        assert.isTrue(result.signer.equals(mockPermissionLevel))
        assert.equal(result.signatures.length, 1)
    })
})
