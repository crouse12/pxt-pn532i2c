// MakeCode extension for PN532 NFC RFID module

function RFID_WriteCommand(cmd: number[]) {
    const PN532_HOSTTOPN532 = 0xD4;
    let cmdlist: number[] = [0, 0, 0xFF];
    let checksum = 0xFF;
    cmdlist.push(cmd.length + 1);
    checksum += cmd.length + 1;
    cmdlist.push(255 - cmd.length);
    checksum += 255 - cmd.length;
    cmdlist.push(PN532_HOSTTOPN532);
    checksum += PN532_HOSTTOPN532;
    cmd.forEach(function (value) {
        cmdlist.push(value);
        checksum += value;
    });
    cmdlist.push(~(checksum & 0xFF));
    cmdlist.push(0);
    let bufr = pins.createBufferFromArray(cmdlist);
    pins.i2cWriteBuffer(0x24, bufr);
    basic.pause(5);
}

function RFID_ReadData(nbytes: number) : number[] {
    let bufr = pins.i2cReadBuffer(0x24, nbytes + 1, false);
    basic.pause(5)
    return bufr.slice(1).toArray(NumberFormat.UInt8LE);
}

function i2cReadAck() : boolean {
    let result = RFID_ReadData(6);
    const pn532ack = [0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00];
    return result.every((v, i) => v === pn532ack[i]);
}

function RFID_SendCommandCheckAck(cmd: number[]) : boolean {
    RFID_WriteCommand(cmd);
    return i2cReadAck();
}

function RFID_GetFirmwareVersion() : number {
    const PN532_COMMAND_GETFIRMWAREVERSION = 0x02;
    if (!RFID_SendCommandCheckAck([PN532_COMMAND_GETFIRMWAREVERSION])) {
        return 0;
    }
    let result = RFID_ReadData(12);

    // Check the first part of the message.
    const pn532response_firmwarevers = [0x00, 0x00, 0xFF, 0x06, 0xFA, 0xD5];
    if (!pn532response_firmwarevers.every((v, i) => v === result[i])) {
        return 0;
    }

    let response = result[7] << 8;
    response = (response | result[8]) << 8;
    response = (response | result[9]) << 8;
    response = response | result[10];
    return response;
}

function RFID_SetPassiveActivationRetries(maxRetries: number) {
    const PN532_COMMAND_RFCONFIGURATION = 0x32;
    const pn532_packetbuffer = [PN532_COMMAND_RFCONFIGURATION,
        5,    // Config item 5 (MaxRetries)
        0xFF, // MxRtyATR (default = 0xFF)
        0x01, // MxRtyPSL (default = 0x01)
        maxRetries];
    RFID_SendCommandCheckAck(pn532_packetbuffer);
}

// brief  Configures the SAM (Secure Access Module)
function RFID_SAMConfig() : boolean {
    const PN532_COMMAND_SAMCONFIGURATION = 0x14;
    const pn532_packetbuffer = [PN532_COMMAND_SAMCONFIGURATION,
        0x01, // normal mode;
        0x14, // timeout 50ms * 20 = 1 second
        0x01] // use IRQ pin! (CT TODO: Check later)

    if (!RFID_SendCommandCheckAck(pn532_packetbuffer))
        return false;

    // read data packet
    const result = RFID_ReadData(8);
    return (result[6] == 0x15);
}

let RFID_initialized = false;
let RFID_startedPassive = false;

function RFID_ReadDetectedPassiveTargetID() : number[] {
    // read data packet
    let pn532_packetbuffer = RFID_ReadData(20);
  // check some basic stuff

  /* ISO14443A card response should be in the following format:

    byte            Description
    -------------   ------------------------------------------
    b0..6           Frame header and preamble
    b7              Tags Found
    b8              Tag Number (only one used in this example)
    b9..10          SENS_RES
    b11             SEL_RES
    b12             NFCID Length
    b13..NFCIDLen   NFCID                                      */

    if (pn532_packetbuffer[7] != 1)
        return [0];

    RFID_startedPassive = false;

    let sens_res = pn532_packetbuffer[9];
    sens_res <<= 8;
    sens_res |= pn532_packetbuffer[10];

    /* Card appears to be Mifare Classic */
    const uidLength = pn532_packetbuffer[12];
    const uid = pn532_packetbuffer.slice(13, 13 + uidLength);
    return uid;
}

function RFID_StartPassiveTargetID() : void {
    const PN532_COMMAND_INLISTPASSIVETARGET = 0x4A;
    const pn532_packetbuffer = [PN532_COMMAND_INLISTPASSIVETARGET,
        1, // max 1 cards at once (we can set this to 2 later)
        0];  // card baud rate
    RFID_SendCommandCheckAck(pn532_packetbuffer);
    RFID_startedPassive = true;
}

function RFID_DoInitialize() : void {
  const version = RFID_GetFirmwareVersion();
  const chip = ((version >> 24) & 0xFF);
  if (chip == 0) {
    return;
  }
  const tens = Math.floor(chip / 16);
  const ones = chip % 16;
  serial.writeString("Found chip PN5" + tens + ones + "\n");
  serial.writeString("Firmware version " + ((version >> 16) & 0xFF) +
    "." + ((version >> 8) & 0xFF) + "\n");

  // Set the max number of retry attempts to read from a card
  // This prevents us from waiting forever for a card, which is
  // the default behaviour of the PN532.
  RFID_SetPassiveActivationRetries(255);
  const samconfig = RFID_SAMConfig();
  RFID_initialized = true;
}

function RFID_ReadPassiveTargetID() : number[] {
    if (!RFID_initialized) {
      RFID_DoInitialize();
      if (!RFID_initialized) {
        return [0];
      }
    }
    if (!RFID_startedPassive) {
        RFID_StartPassiveTargetID();
    }
    // while (pins.digitalReadPin(DigitalPin.P0) == 1) {
    //     basic.pause(10);
    // }
    return RFID_ReadDetectedPassiveTargetID();
}

//% color=#0fbc11 icon="\u272a" block="MakerBit"
//% category="MakerBit"
namespace makerbit {

  /**
   * Get the UID from an RFID (v018)
   */
  //% subcategory="RFID"
  //% blockId="makerbit_rfid_get_uid"
  //% block="RFID UID"
  //% weight=89
  export function rfidGetUID() : number {
    // Wait for an ISO14443A type cards (Mifare, etc.).  When one is found
    // 'uid' will be 4 bytes (Mifare Classic) or 7 bytes (Mifare Ultralight)
    const uid = RFID_ReadPassiveTargetID();
    basic.pause(10);
    if (uid.length == 4) {
      serial.writeString("Found card: ");
      serial.writeNumbers(uid);
      return uid[0] << 24 + uid[1] << 16 + uid[2] << 8 + uid[3];
    }
    return 0;
  }

}
