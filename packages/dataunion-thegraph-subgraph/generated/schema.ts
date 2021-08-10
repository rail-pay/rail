// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.

import {
  TypedMap,
  Entity,
  Value,
  ValueKind,
  store,
  Address,
  Bytes,
  BigInt,
  BigDecimal
} from "@graphprotocol/graph-ts";

export class DataUnion extends Entity {
  constructor(id: string) {
    super();
    this.set("id", Value.fromString(id));
  }

  save(): void {
    let id = this.get("id");
    assert(id !== null, "Cannot save DataUnion entity without an ID");
    assert(
      id.kind == ValueKind.STRING,
      "Cannot save DataUnion entity with non-string ID. " +
        'Considering using .toHex() to convert the "id" to a string.'
    );
    store.set("DataUnion", id.toString(), this);
  }

  static load(id: string): DataUnion | null {
    return store.get("DataUnion", id) as DataUnion | null;
  }

  get id(): string {
    let value = this.get("id");
    return value.toString();
  }

  set id(value: string) {
    this.set("id", Value.fromString(value));
  }

  get sidechainAddress(): Bytes {
    let value = this.get("sidechainAddress");
    return value.toBytes();
  }

  set sidechainAddress(value: Bytes) {
    this.set("sidechainAddress", Value.fromBytes(value));
  }

  get mainchainAddress(): Bytes {
    let value = this.get("mainchainAddress");
    return value.toBytes();
  }

  set mainchainAddress(value: Bytes) {
    this.set("mainchainAddress", Value.fromBytes(value));
  }

  get members(): Array<string> {
    let value = this.get("members");
    return value.toStringArray();
  }

  set members(value: Array<string>) {
    this.set("members", Value.fromStringArray(value));
  }

  get memberCount(): i32 {
    let value = this.get("memberCount");
    return value.toI32();
  }

  set memberCount(value: i32) {
    this.set("memberCount", Value.fromI32(value));
  }
}

export class Member extends Entity {
  constructor(id: string) {
    super();
    this.set("id", Value.fromString(id));
  }

  save(): void {
    let id = this.get("id");
    assert(id !== null, "Cannot save Member entity without an ID");
    assert(
      id.kind == ValueKind.STRING,
      "Cannot save Member entity with non-string ID. " +
        'Considering using .toHex() to convert the "id" to a string.'
    );
    store.set("Member", id.toString(), this);
  }

  static load(id: string): Member | null {
    return store.get("Member", id) as Member | null;
  }

  get id(): string {
    let value = this.get("id");
    return value.toString();
  }

  set id(value: string) {
    this.set("id", Value.fromString(value));
  }

  get address(): Bytes {
    let value = this.get("address");
    return value.toBytes();
  }

  set address(value: Bytes) {
    this.set("address", Value.fromBytes(value));
  }

  get addressString(): string {
    let value = this.get("addressString");
    return value.toString();
  }

  set addressString(value: string) {
    this.set("addressString", Value.fromString(value));
  }

  get dataunion(): string {
    let value = this.get("dataunion");
    return value.toString();
  }

  set dataunion(value: string) {
    this.set("dataunion", Value.fromString(value));
  }

  get status(): string {
    let value = this.get("status");
    return value.toString();
  }

  set status(value: string) {
    this.set("status", Value.fromString(value));
  }
}

export class DataUnionStatsBucket extends Entity {
  constructor(id: string) {
    super();
    this.set("id", Value.fromString(id));
  }

  save(): void {
    let id = this.get("id");
    assert(
      id !== null,
      "Cannot save DataUnionStatsBucket entity without an ID"
    );
    assert(
      id.kind == ValueKind.STRING,
      "Cannot save DataUnionStatsBucket entity with non-string ID. " +
        'Considering using .toHex() to convert the "id" to a string.'
    );
    store.set("DataUnionStatsBucket", id.toString(), this);
  }

  static load(id: string): DataUnionStatsBucket | null {
    return store.get("DataUnionStatsBucket", id) as DataUnionStatsBucket | null;
  }

  get id(): string {
    let value = this.get("id");
    return value.toString();
  }

  set id(value: string) {
    this.set("id", Value.fromString(value));
  }

  get type(): string {
    let value = this.get("type");
    return value.toString();
  }

  set type(value: string) {
    this.set("type", Value.fromString(value));
  }

  get dataUnionAddress(): Bytes {
    let value = this.get("dataUnionAddress");
    return value.toBytes();
  }

  set dataUnionAddress(value: Bytes) {
    this.set("dataUnionAddress", Value.fromBytes(value));
  }

  get startDate(): BigInt {
    let value = this.get("startDate");
    return value.toBigInt();
  }

  set startDate(value: BigInt) {
    this.set("startDate", Value.fromBigInt(value));
  }

  get endDate(): BigInt {
    let value = this.get("endDate");
    return value.toBigInt();
  }

  set endDate(value: BigInt) {
    this.set("endDate", Value.fromBigInt(value));
  }

  get memberCountAtStart(): i32 {
    let value = this.get("memberCountAtStart");
    return value.toI32();
  }

  set memberCountAtStart(value: i32) {
    this.set("memberCountAtStart", Value.fromI32(value));
  }

  get memberCountChange(): i32 {
    let value = this.get("memberCountChange");
    return value.toI32();
  }

  set memberCountChange(value: i32) {
    this.set("memberCountChange", Value.fromI32(value));
  }
}
