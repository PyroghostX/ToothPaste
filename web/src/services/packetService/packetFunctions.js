import { create, toBinary, fromBinary } from "@bufbuild/protobuf";
import * as ToothPacketPB from './toothpacket/toothpacket_pb.js';

const HID_SAFE_REPLACEMENTS = new Map([
    ['\u2018', "'"],
    ['\u2019', "'"],
    ['\u201A', "'"],
    ['\u201B', "'"],
    ['\u2032', "'"],
    ['\u201C', '"'],
    ['\u201D', '"'],
    ['\u201E', '"'],
    ['\u201F', '"'],
    ['\u2033', '"'],
    ['\u2013', '-'],
    ['\u2014', '--'],
    ['\u2015', '--'],
    ['\u2026', '...'],
    ['\u00A0', ' '],
    ['\u2000', ' '],
    ['\u2001', ' '],
    ['\u2002', ' '],
    ['\u2003', ' '],
    ['\u2004', ' '],
    ['\u2005', ' '],
    ['\u2006', ' '],
    ['\u2007', ' '],
    ['\u2008', ' '],
    ['\u2009', ' '],
    ['\u200A', ' '],
    ['\u202F', ' '],
    ['\u205F', ' '],
    ['\u3000', ' '],
    ['\u200B', ''],
    ['\u200C', ''],
    ['\u200D', ''],
    ['\u2060', ''],
    ['\uFEFF', ''],
]);

const MAX_KEYBOARD_PAYLOAD_BYTES = 190;

export function normalizeKeyboardText(input) {
    if (typeof input !== 'string' || input.length === 0) {
        return '';
    }

    let normalized = input
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    for (const [from, to] of HID_SAFE_REPLACEMENTS.entries()) {
        normalized = normalized.split(from).join(to);
    }

    normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

    return Array.from(normalized, (char) => {
        const code = char.charCodeAt(0);
        if (code === 9 || code === 10 || code === 8) {
            return char;
        }
        return code >= 32 && code <= 126 ? char : '?';
    }).join('');
}

function buildKeyboardPacket(keyString) {
    const keyboardPacket = create(ToothPacketPB.KeyboardPacketSchema, {});
    keyboardPacket.message = keyString;
    keyboardPacket.length = keyString.length;

    return create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.KEYBOARD_STRING,
        packetData: {
            case: "keyboardPacket",
            value: keyboardPacket,
        },
    });
}

// Create an unencrypted DataPacket from an input string
export function createUnencryptedPacket(inputString) {
    const encoder = new TextEncoder();
    const textData = encoder.encode(inputString); // Encode the input string into a byte array

    // protobuf packets
    const unencryptedPacket = create(ToothPacketPB.DataPacketSchema, {});
    unencryptedPacket.encryptedData = textData;
    unencryptedPacket.packetID = 1;
    unencryptedPacket.slowMode = true;
    unencryptedPacket.packetNumber = 1;
    unencryptedPacket.dataLen = textData.length;
    unencryptedPacket.tag = new Uint8Array(16); // Empty tag for unencrypted packet
    unencryptedPacket.iv = new Uint8Array(12); // Empty IV for unencrypted packet

    return toBinary(ToothPacketPB.DataPacketSchema, unencryptedPacket);
}

// Return an EncryptedData packet containing a MousePacket
export function createMousePacket(x, y, leftClick = false, rightClick = false) {
    const frame = create(ToothPacketPB.FrameSchema, {});
    frame.x = Math.round(x);
    frame.y = Math.round(y);

    const mousePacket = create(ToothPacketPB.MousePacketSchema, {});
    
    mousePacket.frames = [frame];
    mousePacket.numFrames = 1;
    mousePacket.lClick = leftClick;
    mousePacket.rClick = rightClick;
    
    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.MOUSE,
        packetData: {
        case: "mousePacket",
        value: mousePacket,
        },
    });

    return encryptedPacket
}

// Return an EncryptedData packet containing a MousePacket
export function createMouseStream(frames, leftClick = false, rightClick = false, scrollDelta = 0) {
    const mousePacket = create(ToothPacketPB.MousePacketSchema, {});
    
    for (let frame of frames) {
        const pbFrame = create(ToothPacketPB.FrameSchema, {});
        pbFrame.x = Math.round(frame.x);
        pbFrame.y = Math.round(frame.y);
        mousePacket.frames.push(pbFrame);
    }

    mousePacket.numFrames = frames.length;
    mousePacket.lClick = Number(leftClick);
    mousePacket.rClick = Number(rightClick);
    mousePacket.wheel = scrollDelta;

    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.MOUSE,
        packetData: {
        case: "mousePacket",
        value: mousePacket,
        },
    });

    return encryptedPacket
}

// Return an EncryptedData packet containing a KeyboardPacket
export function createKeyboardPacket(keyString) {
    return buildKeyboardPacket(normalizeKeyboardText(keyString));
}

export function createKeyboardStream(keyStrings) {
    const fullString = normalizeKeyboardText(Array.isArray(keyStrings) ? keyStrings.join('') : keyStrings);
    const packets = [];

    let chunkStart = 0;
    while (chunkStart < fullString.length) {
        let chunkEnd = chunkStart + 1;
        let lastGoodEnd = chunkEnd;

        while (chunkEnd <= fullString.length) {
            const candidatePacket = buildKeyboardPacket(fullString.slice(chunkStart, chunkEnd));
            const candidateSize = toBinary(ToothPacketPB.EncryptedDataSchema, candidatePacket).length;
            if (candidateSize > MAX_KEYBOARD_PAYLOAD_BYTES) {
                break;
            }
            lastGoodEnd = chunkEnd;
            chunkEnd += 1;
        }

        packets.push(buildKeyboardPacket(fullString.slice(chunkStart, lastGoodEnd)));
        chunkStart = lastGoodEnd;
    }

    return packets;
}

// Return an EncryptedData packet containing a KeycodePacket
export function createKeyCodePacket(keycode) {
    const keycodePacket = create(ToothPacketPB.KeycodePacketSchema, {});
    keycodePacket.code = keycode;
    keycodePacket.length = keycode.length;

    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.KEYBOARD_KEYCODE,
        packetData: {
        case: "keycodePacket",
        value: keycodePacket,
        },
    });
    
    return encryptedPacket;
}

// Return an EncryptedData packet containing a RenamePacket
export function createRenamePacket(newName) {
    const renamePacket = create(ToothPacketPB.RenamePacketSchema, {});
    renamePacket.message = newName;
    renamePacket.length = newName.length;

    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.RENAME,
        packetData: {
        case: "renamePacket",
        value: renamePacket,
        },
    });

    return encryptedPacket;
}

// Return an EncryptedData packet containing a RenamePacket
export function createConsumerControlPacket(code) {
    const controlPacket = create(ToothPacketPB.ConsumerControlPacketSchema, {});
    controlPacket.code.push(code);
    controlPacket.length = 1;

    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.CONSUMER_CONTROL,
        packetData: {
        case: "consumerControlPacket",
        value: controlPacket,
        },
    });

    return encryptedPacket;
}

// Return an EncryptedData packet containing a MouseJigglePacket
export function createMouseJigglePacket(enable) {
    const jigglePacket = create(ToothPacketPB.MouseJigglePacketSchema, {});
    jigglePacket.enable = enable;

    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.COMPOSITE,
        packetData: {
        case: "mouseJigglePacket",
        value: jigglePacket,
        },
    });

    return encryptedPacket;
}

export function unpackResponsePacket(responsePacketBytes) {
    
    // Deserialize the ResponsePacket from binary data
    const responsePacket = fromBinary(ToothPacketPB.ResponsePacketSchema, responsePacketBytes);
    return responsePacket;  
}
