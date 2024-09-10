import { Buffer as NodeBuffer } from "buffer"

// Avoid Node.js deprecation warning when dependencies still call `new Buffer(...)`.
function SafeBuffer(
	arg: string | ArrayBuffer | SharedArrayBuffer | Uint8Array | number,
	encodingOrOffset?: BufferEncoding | number,
	length?: number
) {
	if (typeof arg === "number") {
		return NodeBuffer.allocUnsafe(arg)
	}
	return NodeBuffer.from(arg as any, encodingOrOffset as any, length as any)
}

SafeBuffer.prototype = NodeBuffer.prototype
Object.setPrototypeOf(SafeBuffer, NodeBuffer)
Object.assign(SafeBuffer, NodeBuffer)

;(globalThis as any).Buffer = SafeBuffer as typeof Buffer
