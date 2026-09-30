package dev.talk2scale.scale

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

object ScaleUuids {
    const val SERVICE = "4c78c001-8118-4aea-8f72-70ddbda3c9b9"
    const val NOTIFY = "4c78c002-8118-4aea-8f72-70ddbda3c9b9"
    const val WRITE = "4c78c003-8118-4aea-8f72-70ddbda3c9b9"
    const val DEVICE_NAME = "TalkToScale"
    val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    val service: UUID = UUID.fromString(SERVICE)
    val notify: UUID = UUID.fromString(NOTIFY)
    val write: UUID = UUID.fromString(WRITE)
}

object ScaleCodec {
    fun decodeWeight(payload: ByteArray): Int? {
        if (payload.size < 4) return null
        return ByteBuffer.wrap(payload, 0, 4).order(ByteOrder.LITTLE_ENDIAN).int
    }

    fun tareBytes(): ByteArray = byteArrayOf(0x01)

    fun calibrateBytes(refMassGrams: Int): ByteArray {
        val grams = refMassGrams and 0xFFFF
        return byteArrayOf(
            0x02,
            (grams and 0xFF).toByte(),
            ((grams shr 8) and 0xFF).toByte(),
        )
    }
}
