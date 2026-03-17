#!/usr/bin/env python3
"""
Standalone simulation publisher for testing Anvil connectors.

Publishes synthetic military asset track data via Kafka and/or DIS multicast.
"""

import argparse
import asyncio
import json
import random
import socket
import sys
from datetime import datetime, timezone

# ── Asset definitions ─────────────────────────────────────────

ASSETS = ["DDG_1", "DDG_2", "DDG_3", "CG_1", "FFG_1"]


def init_positions() -> dict[str, dict]:
    """Create random initial positions for each asset."""
    positions = {}
    for asset in ASSETS:
        positions[asset] = {
            "lat": 34.0 + random.uniform(-1.0, 1.0),
            "lon": -118.0 + random.uniform(-1.0, 1.0),
            "heading": random.uniform(0, 360),
            "speed": random.uniform(5, 25),
        }
    return positions


def update_position(pos: dict) -> dict:
    """Drift a position with random noise."""
    pos["lat"] += random.gauss(0, 0.002)
    pos["lon"] += random.gauss(0, 0.002)
    pos["heading"] = (pos["heading"] + random.gauss(0, 3)) % 360
    pos["speed"] = max(0.0, pos["speed"] + random.gauss(0, 0.5))
    return pos


def make_record(asset_id: str, pos: dict) -> dict:
    return {
        "asset_id": asset_id,
        "lat": round(pos["lat"], 6),
        "lon": round(pos["lon"], 6),
        "heading": round(pos["heading"], 1),
        "speed": round(pos["speed"], 1),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── Kafka publisher ──────────────────────────────────────────


async def publish_kafka(
    broker: str,
    topic: str,
    interval: float,
):
    try:
        from aiokafka import AIOKafkaProducer  # type: ignore[import-untyped]
    except ImportError:
        print("[ERROR] aiokafka is not installed. Install with: pip install aiokafka")
        print("        Kafka publishing is unavailable.")
        return

    producer = AIOKafkaProducer(bootstrap_servers=broker)
    try:
        await producer.start()
        print(f"[KAFKA] Connected to {broker}, publishing to topic '{topic}'")
    except Exception as e:
        print(f"[KAFKA] Failed to connect to {broker}: {e}")
        return

    positions = init_positions()
    tick = 0
    try:
        while True:
            for asset_id in ASSETS:
                update_position(positions[asset_id])
                record = make_record(asset_id, positions[asset_id])
                value = json.dumps(record).encode("utf-8")
                await producer.send_and_wait(topic, value)
            tick += 1
            if tick % 10 == 0:
                print(f"[KAFKA] Published {tick * len(ASSETS)} messages")
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        pass
    finally:
        await producer.stop()
        print("[KAFKA] Producer stopped")


# ── ZMQ publisher ─────────────────────────────────────────────


async def publish_zmq(
    endpoint: str,
    interval: float,
):
    try:
        import zmq  # type: ignore[import-untyped]
        import zmq.asyncio  # type: ignore[import-untyped]
    except ImportError:
        print("[ERROR] pyzmq is not installed. Install with: pip install pyzmq")
        print("        ZMQ publishing is unavailable.")
        return

    ctx = zmq.asyncio.Context()
    sock = ctx.socket(zmq.PUB)
    sock.bind(endpoint)
    print(f"[ZMQ] Publishing on {endpoint}")

    # Brief pause to let subscribers connect
    await asyncio.sleep(0.5)

    positions = init_positions()
    tick = 0
    try:
        while True:
            for asset_id in ASSETS:
                update_position(positions[asset_id])
                record = make_record(asset_id, positions[asset_id])
                await sock.send_json(record)
            tick += 1
            if tick % 10 == 0:
                print(f"[ZMQ] Published {tick * len(ASSETS)} messages")
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        pass
    finally:
        sock.close()
        ctx.term()
        print("[ZMQ] Socket closed")


# ── DIS publisher ─────────────────────────────────────────────


async def publish_dis(
    address: str,
    port: int,
    interval: float,
):
    try:
        from opendis.dis7 import EntityStatePdu  # type: ignore[import-untyped]
        from opendis.RangeCoordinates import GPS  # type: ignore[import-untyped]
    except ImportError:
        print("[ERROR] opendis is not installed. Install with: pip install opendis")
        print("        DIS publishing is unavailable.")
        return

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 32)
    print(f"[DIS] Sending Entity State PDUs to {address}:{port}")

    gps = GPS()
    positions = init_positions()
    entity_map = {asset: idx + 1 for idx, asset in enumerate(ASSETS)}
    tick = 0

    try:
        while True:
            for asset_id in ASSETS:
                update_position(positions[asset_id])
                pos = positions[asset_id]

                pdu = EntityStatePdu()
                pdu.entityID.entityID = entity_map[asset_id]
                pdu.entityID.siteID = 1
                pdu.entityID.applicationID = 1

                # Convert lat/lon to geocentric coords
                try:
                    xyz = gps.lla2ecef((pos["lat"], pos["lon"], 0.0))
                    pdu.entityLocation.x = xyz[0]
                    pdu.entityLocation.y = xyz[1]
                    pdu.entityLocation.z = xyz[2]
                except Exception:
                    pdu.entityLocation.x = pos["lat"]
                    pdu.entityLocation.y = pos["lon"]
                    pdu.entityLocation.z = 0.0

                pdu.entityOrientation.psi = pos["heading"]

                data = pdu.serialize()
                sock.sendto(data, (address, port))

            tick += 1
            if tick % 10 == 0:
                print(f"[DIS] Sent {tick * len(ASSETS)} PDUs")
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        pass
    finally:
        sock.close()
        print("[DIS] Socket closed")


# ── CLI ───────────────────────────────────────────────────────


def parse_args():
    parser = argparse.ArgumentParser(
        description="Publish simulated military asset data via Kafka and/or DIS"
    )
    parser.add_argument(
        "--zmq",
        action="store_true",
        help="Enable ZMQ PUB publishing (simplest, no broker needed)",
    )
    parser.add_argument(
        "--kafka",
        action="store_true",
        help="Enable Kafka publishing",
    )
    parser.add_argument(
        "--dis",
        action="store_true",
        help="Enable DIS multicast publishing",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Publish interval in seconds (default: 1.0)",
    )
    parser.add_argument(
        "--kafka-broker",
        type=str,
        default="localhost:9092",
        help="Kafka broker address (default: localhost:9092)",
    )
    parser.add_argument(
        "--kafka-topic",
        type=str,
        default="sim-assets",
        help="Kafka topic name (default: sim-assets)",
    )
    parser.add_argument(
        "--dis-address",
        type=str,
        default="239.1.2.3",
        help="DIS multicast address (default: 239.1.2.3)",
    )
    parser.add_argument(
        "--dis-port",
        type=int,
        default=3000,
        help="DIS multicast port (default: 3000)",
    )
    parser.add_argument(
        "--zmq-endpoint",
        type=str,
        default="tcp://*:5555",
        help="ZMQ PUB bind endpoint (default: tcp://*:5555)",
    )
    return parser.parse_args()


async def main():
    args = parse_args()

    if not args.zmq and not args.kafka and not args.dis:
        print("[INFO] No protocol selected. Use --zmq, --kafka, and/or --dis.")
        print("[INFO] Tip: --zmq is the simplest (no broker needed).")
        print("[INFO] Run with --help for all options.")
        sys.exit(1)

    tasks = []
    print(f"[INFO] Publishing interval: {args.interval}s")
    print(f"[INFO] Assets: {', '.join(ASSETS)}")

    if args.zmq:
        print(f"[INFO] ZMQ endpoint: {args.zmq_endpoint}")
        tasks.append(
            asyncio.create_task(
                publish_zmq(args.zmq_endpoint, args.interval)
            )
        )

    if args.kafka:
        print(f"[INFO] Kafka broker: {args.kafka_broker}, topic: {args.kafka_topic}")
        tasks.append(
            asyncio.create_task(
                publish_kafka(args.kafka_broker, args.kafka_topic, args.interval)
            )
        )

    if args.dis:
        print(f"[INFO] DIS multicast: {args.dis_address}:{args.dis_port}")
        tasks.append(
            asyncio.create_task(
                publish_dis(args.dis_address, args.dis_port, args.interval)
            )
        )

    try:
        await asyncio.gather(*tasks)
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down...")
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
