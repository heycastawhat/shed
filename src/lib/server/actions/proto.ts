import protobuf from 'protobufjs';
import { PROTO } from './proto-src.js';

const root = new protobuf.Root();
protobuf.parse(`syntax = "proto3"; package rpc; ${PROTO.replaceAll('google.protobuf.', '.google.protobuf.')}`, root, { keepCase: true });
root.addJSON(protobuf.common.get('google/protobuf/struct.proto')!.nested!);
root.addJSON(protobuf.common.get('google/protobuf/timestamp.proto')!.nested!);
root.resolveAll();

export const type = (name: string) => root.lookupType(`rpc.${name}`);

// JSON value → google.protobuf.Value, for the task context Struct.
export function toValue(v: unknown): Record<string, unknown> {
	if (v === null || v === undefined) return { nullValue: 0 };
	if (typeof v === 'string') return { stringValue: v };
	if (typeof v === 'number') return { numberValue: v };
	if (typeof v === 'boolean') return { boolValue: v };
	if (Array.isArray(v)) return { listValue: { values: v.map(toValue) } };
	return { structValue: toStruct(v as Record<string, unknown>) };
}
export const toStruct = (o: Record<string, unknown>) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)])) });

export const RESULT = { unspecified: 0, success: 1, failure: 2, cancelled: 3, skipped: 4 } as const;
export const RESULT_NAME = ['', 'success', 'failure', 'cancelled', 'skipped'] as const;
