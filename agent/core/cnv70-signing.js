import { sha256 } from "../utils/crypto.js";

// Recovered from live V70 dispatch/rodata; see docs/CNV70_RUNTIME.md.
const TYPE_CONSTANTS = Object.freeze([
    0xa3b1c7d2, 0xe4f5a6b8, 0x1c2d3e4f, 0x5a6b7c8d,
    0x9e0f1a2b, 0x3c4d5e6f, 0x7a8b9cad, 0xbe0f1d2c,
    0x4e5f6a7b, 0x8c9dae0f, 0xd1e2f3a4, 0x15263748,
    0x596a7b8c, 0x9dae0f1c, 0x2d3e4f5a, 0x6b7c8d9e,
    0xaf0b1c2d, 0xe3f4a5b6, 0x27384950, 0x6b7c8d9f,
    0xaf0c1d2e, 0xe3f5a6b7, 0x17283940, 0x5b6c7d8e
]);
const INNER_MASK = Object.freeze([
    0x7c, 0x4d, 0x1a, 0xab, 0xd7, 0xc5, 0x60, 0xbe,
    0xf2, 0xe3, 0x58, 0x39, 0x94, 0x85, 0x21, 0x0f
]);
const OUTER_MASK = Object.freeze([
    0x16, 0x27, 0x70, 0xc1, 0xbd, 0xaf, 0x0a, 0xd4,
    0x98, 0x89, 0x32, 0x53, 0xfe, 0xef, 0x4b, 0x65
]);

function concat(a, b)
{
    const result = new Uint8Array(a.length + b.length);
    result.set(a);
    result.set(b, a.length);
    return result;
}

function hashBlock(key, mask, pad)
{
    const result = new Uint8Array(64).fill(pad);
    for (let i = 0; i < 16; i++) result[i] = key[i] ^ mask[i];
    return result;
}

// commandData is exactly the 16 bytes at ClientInput+4, before token storage.
export function computeCNV70Token(key, commandData)
{
    if (key.length !== 16 || commandData.length !== 16)
        throw new Error("Expected 16-byte signing key and command data");
    const type = new DataView(commandData.buffer, commandData.byteOffset, 16).getUint32(4, true);
    const constant = type < TYPE_CONSTANTS.length ? TYPE_CONSTANTS[type] : 0xdeadbeef;
    const message = new Uint8Array(20);
    message.set(commandData.subarray(4), 0);
    message.set(commandData.subarray(0, 4), 12);
    new DataView(message.buffer).setUint32(16, constant, true);
    const inner = sha256(concat(hashBlock(key, INNER_MASK, 0x36), message));
    const digest = sha256(concat(hashBlock(key, OUTER_MASK, 0x5c), inner));
    const token = digest[0] | ((digest[1] & 0x7f) << 8);
    return token <= 1 ? 1 : token;
}
