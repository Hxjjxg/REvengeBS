import assert from "node:assert/strict";
import test from "node:test";
import { computeCNV70Token } from "../agent/core/cnv70-signing.js";

// Independent Python hashlib reference values for the recovered native format.
const vectors = [
    {
        "type": 0,
        "key": "000102030405060708090a0b0c0d0e0f",
        "commandData": "44332211000000003930000018fcffff",
        "token": 375
    },
    {
        "type": 2,
        "key": "000102030405060708090a0b0c0d0e0f",
        "commandData": "44332211020000003930000018fcffff",
        "token": 29087
    },
    {
        "type": 9,
        "key": "000102030405060708090a0b0c0d0e0f",
        "commandData": "44332211090000003930000018fcffff",
        "token": 15172
    },
    {
        "type": 22,
        "key": "000102030405060708090a0b0c0d0e0f",
        "commandData": "44332211160000003930000018fcffff",
        "token": 24232
    },
    {
        "type": 23,
        "key": "000102030405060708090a0b0c0d0e0f",
        "commandData": "44332211170000003930000018fcffff",
        "token": 29712
    },
    {
        "type": 24,
        "key": "000102030405060708090a0b0c0d0e0f",
        "commandData": "44332211180000003930000018fcffff",
        "token": 10341
    },
    {
        "type": 4294967295,
        "key": "000102030405060708090a0b0c0d0e0f",
        "commandData": "44332211ffffffff3930000018fcffff",
        "token": 431
    }
];

for (const vector of vectors)
{
    test("CN V70 native signing format, command type " + vector.type, () =>
    {
        const key = new Uint8Array(Buffer.from(vector.key, "hex"));
        const storage = new Uint8Array(24);
        storage.set(Buffer.from(vector.commandData, "hex"), 8);
        const data = storage.subarray(8);
        const before = data.slice();
        assert.equal(computeCNV70Token(key, data), vector.token);
        assert.deepEqual(data, before);
    });
}

test("reject truncated signing inputs", () =>
{
    assert.throws(() => computeCNV70Token(new Uint8Array(15), new Uint8Array(16)));
    assert.throws(() => computeCNV70Token(new Uint8Array(16), new Uint8Array(15)));
});
