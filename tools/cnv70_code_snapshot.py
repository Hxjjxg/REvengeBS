"""Copy live executable sections into an offline analysis ELF; never write to the target."""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
from datetime import datetime, timezone


def read_root_memory(serial, pid, address, size):
    if pid <= 0 or address < 0 or size <= 0:
        raise ValueError("Invalid root memory read range")
    block_size = 4096
    start = address % block_size
    count = (start + size + block_size - 1) // block_size
    command = (f"su -c 'dd if=/proc/{pid}/mem bs={block_size} "
               f"skip={address // block_size} count={count}'")
    result = subprocess.run(["adb", "-s", serial, "exec-out", command],
                            capture_output=True, check=True, timeout=30)
    data = result.stdout[start:start + size]
    if len(data) != size:
        raise ValueError(f"Short root memory read: {len(data)} of {size} bytes")
    return data


def executable_sections(data):
    if data[:6] != b"\x7fELF\x02\x01":
        raise ValueError("Expected a little-endian ELF64 source")
    section_offset = struct.unpack_from("<Q", data, 40)[0]
    entry_size, count, names_index = struct.unpack_from("<HHH", data, 58)
    sections = [struct.unpack_from("<IIQQQQIIQQ", data, section_offset + i * entry_size)
                for i in range(count)]
    names_section = sections[names_index]
    names = data[names_section[4]:names_section[4] + names_section[5]]
    for section in sections:
        name, kind, flags, address, offset, size, *_ = section
        if flags & 6 == 6 and kind == 1 and size:
            if offset + size > len(data):
                raise ValueError("Executable section exceeds source file")
            yield names[name:].split(b"\0", 1)[0].decode(), address, offset, size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--pid", required=True, type=int)
    parser.add_argument("--base", required=True, type=lambda value: int(value, 0))
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output already exists; use a new snapshot filename")

    if args.pid <= 0 or args.base < 0:
        parser.error("PID must be positive and base must be nonnegative")

    def read_memory(address, size):
        return read_root_memory(args.serial, args.pid, address, size)

    original = args.source.read_bytes()
    snapshot = bytearray(original)
    if read_memory(args.base, 64) != original[:64]:
        raise ValueError("Live ELF header differs from the source at the supplied module base")
    records = []
    for name, address, offset, size in executable_sections(original):
        snapshot[offset:offset + size] = read_memory(args.base + address, size)
        before = original[offset:offset + size]
        after = snapshot[offset:offset + size]
        records.append({"name": name, "rva": hex(address), "file_offset": hex(offset),
                        "size": size, "changed_bytes": sum(a != b for a, b in zip(before, after)),
                        "sha256": hashlib.sha256(after).hexdigest()})
        print(json.dumps(records[-1]), flush=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(snapshot)
    metadata = {"source": str(args.source.resolve()), "pid": args.pid,
                "serial": args.serial, "module_base": hex(args.base), "backend": "adb-root-proc-mem",
                "captured_at": datetime.now(timezone.utc).isoformat(),
                "source_sha256": hashlib.sha256(original).hexdigest(),
                "snapshot_sha256": hashlib.sha256(snapshot).hexdigest(), "sections": records,
                "note": "Analysis snapshot: only executable sections replaced with live bytes. "
                        "Other sections remain from the source ELF; not a deployable library."}
    args.output.with_suffix(args.output.suffix + ".json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata), flush=True)


if __name__ == "__main__":
    main()
