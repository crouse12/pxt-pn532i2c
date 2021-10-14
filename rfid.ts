// MakeCode extension for PN532 NFC RFID module

  const PN532_COMMAND_GETFIRMWAREVERSION = 0x02;
  const PN532_COMMAND_SAMCONFIGURATION = 0x14;
  const PN532_COMMAND_RFCONFIGURATION = 0x32;
  const PN532_HOSTTOPN532 = 0xD4;
  const PN532_COMMAND_INDATAEXCHANGE = 0x40;
  const PN532_COMMAND_INLISTPASSIVETARGET = 0x4A;

function RFID_WriteCommand(cmd: number[]) {
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

function RFID_ReadAck() : boolean {
    let result = RFID_ReadData(6);
    const pn532ack = [0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00];
    return result.every((v, i) => v === pn532ack[i]);
}

function RFID_SendCommandCheckAck(cmd: number[]) : boolean {
    RFID_WriteCommand(cmd);
    return RFID_ReadAck();
}

function RFID_GetFirmwareVersion() : number {
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
    const pn532_packetbuffer = [PN532_COMMAND_RFCONFIGURATION,
        5,    // Config item 5 (MaxRetries)
        0xFF, // MxRtyATR (default = 0xFF)
        0x01, // MxRtyPSL (default = 0x01)
        maxRetries];
    RFID_SendCommandCheckAck(pn532_packetbuffer);
}

// brief  Configures the SAM (Secure Access Module)
function RFID_SAMConfig() : boolean {
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

    // If we successfully got a response, reset our passive read.
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

const enum RFID_key {
  AUTH_A = 0,
  AUTH_B = 1
}

function RFID_MifareAuthenticateBlock(uid: number[], blockNumber: number,
  key: number, keyData: number[]) : boolean {

  // Prepare the authentication command //
  let pn532_packetbuffer = [PN532_COMMAND_INDATAEXCHANGE, // Data Exchange Header
    1,                    // Max card numbers
    ([0x60, 0x61])[key],  // MIFARE_CMD_AUTH_A or MIFARE_CMD_AUTH_B
    blockNumber];               // Block Number (1K = 0..63, 4K = 0..255
  pn532_packetbuffer = pn532_packetbuffer.concat(keyData);
  pn532_packetbuffer = pn532_packetbuffer.concat(uid);

  if (!RFID_SendCommandCheckAck(pn532_packetbuffer))
    return false;

  // Read the response packet
  pn532_packetbuffer = RFID_ReadData(12);

  // check if the response is valid and we are authenticated???
  // for an auth success it should be bytes 5-7: 0xD5 0x41 0x00
  // Mifare auth error is technically byte 7: 0x14 but anything other and 0x00
  // is not good
  if (pn532_packetbuffer[7] != 0x00) {
//    serial.writeString("Authentification failed: ");
//    serial.writeNumbers(pn532_packetbuffer);
    return false;
  }

  return true;
}


function RFID_MifareWriteDataBlock(blockNumber: number,
  dataPayload: number[]): boolean {
    const MIFARE_CMD_WRITE = 0xA0;

    /* Prepare the first command */
  let pn532_packetbuffer = [PN532_COMMAND_INDATAEXCHANGE, 
    1,                /* Card number */
    MIFARE_CMD_WRITE, /* Mifare Write command = 0xA0 */
    blockNumber]; /* Block Number (0..63 for 1K, 0..255 for 4K) */
  pn532_packetbuffer = pn532_packetbuffer.concat(dataPayload);

  /* Send the command */
  if (!RFID_SendCommandCheckAck(pn532_packetbuffer)) {
    serial.writeString("Failed to receive ACK for write command\n");
    return false;
  }

  basic.pause(10);

  /* Read the response packet */
  pn532_packetbuffer = RFID_ReadData(26);

  return true;
}


function RFID_MifareWriteNDEFURI(sectorNumber: number, uriIdentifier: number,
  url: string) : boolean {

  // Make sure we're within a 1K limit for the sector number
  if ((sectorNumber < 1) || (sectorNumber > 15))
    return false;

  // Make sure the URI payload is between 1 and 38 chars
  if ((url.length < 1) || (url.length > 38))
    return false;

  // Note 0xD3 0xF7 0xD3 0xF7 0xD3 0xF7 must be used for key A
  // in NDEF records

  // Setup the sector buffer (w/pre-formatted TLV wrapper and NDEF message)
  let buffer1to3 = [
    0x00, 0x00, 0x03,
    url.length + 5,
    0xD1, 0x01,
    url.length + 1,
    0x55,
    uriIdentifier];
  let buffer4 = [0xD3, 0xF7, 0xD3, 0xF7, 0xD3, 0xF7, 0x7F, 0x07,
                 0x88, 0x40, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
  for (let i=0; i < url.length; i++) {
    buffer1to3.push(url.charCodeAt(i) & 0xFF);
  }
  buffer1to3.push(0xFE);  // end-of-URL marker
  for (let i=0; i < 38 - url.length; i++) {
    buffer1to3.push(0x00);
  }

  // Now write all four blocks back to the card
  if (!(RFID_MifareWriteDataBlock(sectorNumber * 4, buffer1to3.slice(0, 16))))
    return false;
  if (!(RFID_MifareWriteDataBlock((sectorNumber * 4) + 1, buffer1to3.slice(16, 32))))
    return false;
  if (!(RFID_MifareWriteDataBlock((sectorNumber * 4) + 2, buffer1to3.slice(32, 48))))
    return false;
  if (!(RFID_MifareWriteDataBlock((sectorNumber * 4) + 3, buffer4)))
    return false;

  return true;
}


function RFID_MifareFormatNDEF() : boolean {
  const sectorbuffer1 = [0x14, 0x01, 0x03, 0xE1, 0x03, 0xE1, 0x03, 0xE1,
    0x03, 0xE1, 0x03, 0xE1, 0x03, 0xE1, 0x03, 0xE1];
  const sectorbuffer2 = [0x03, 0xE1, 0x03, 0xE1, 0x03, 0xE1, 0x03, 0xE1,
    0x03, 0xE1, 0x03, 0xE1, 0x03, 0xE1, 0x03, 0xE1];
  const sectorbuffer3 = [0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0x78, 0x77,
    0x88, 0xC1, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];

  // Note 0xA0 0xA1 0xA2 0xA3 0xA4 0xA5 must be used for key A
  // for the MAD sector in NDEF records (sector 0)

  // Write block 1 and 2 to the card
  if (!(RFID_MifareWriteDataBlock(1, sectorbuffer1)))
    return false;
  if (!(RFID_MifareWriteDataBlock(2, sectorbuffer2)))
    return false;
  // Write key A and access rights card
  if (!(RFID_MifareWriteDataBlock(3, sectorbuffer3)))
    return false;

  return true;
}


//% color=#0fbc11 icon="\u272a" block="MakerBit"
//% category="MakerBit"
namespace makerbit {

  /**
   * Get the UID from an RFID (v019)
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
      let uid32 = (uid[0] << 24) + (uid[1] << 16) + (uid[2] << 8) + uid[3];
      return uid32;
    }
    return 0;
  }

  /**
   * Write a URL to an RFID. Do not include the http://. Max 38 characters.
   */
  //% subcategory="RFID"
  //% blockId="makerbit_rfid_write_url"
  //% block="RFID write URL $url"
  //% url.defl="1010technologies.com"
  //% weight=89
  export function rfidWriteURL(url: string) {
    let uid = [0];
    while ((uid = RFID_ReadPassiveTargetID()).length != 4) {
      serial.writeString("Place card on the RFID chip\n");
      basic.showString("card?");
    }
    serial.writeString("Found card: ");
    serial.writeNumbers(uid);

    const keya = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];

    // // First see if we need to reformat the card for NDEF.
    let success = RFID_MifareAuthenticateBlock(uid, 0, RFID_key.AUTH_A, keya);
    if (success) {
      serial.writeString("Formatting card for NDEF\n");
      if (!RFID_MifareFormatNDEF()) {
        serial.writeString("Unable to format the card for NDEF\n");
        basic.showString("err")
        return;
      }
    }

    // // Now see if this is a newly-formatted card (still old key)
    // // or if we are rewriting an existing NDEF URL.
    serial.writeString("Trying original (non-NDEF) key.\n");
    success = RFID_MifareAuthenticateBlock(uid, 4, RFID_key.AUTH_A, keya);
    if (!success) {
      serial.writeString("Doesn't seem to be non-NDEF. Trying NDEF key.\n");
      // TODO: For some reason we need to call this twice. The Arduino code
      // only needs to call it once. Not sure why.
      uid = RFID_ReadPassiveTargetID(); // Reset PN532
      uid = RFID_ReadPassiveTargetID();
      const keya_ndef = [ 0xD3, 0xF7, 0xD3, 0xF7, 0xD3, 0xF7 ];
      success = RFID_MifareAuthenticateBlock(uid, 4, RFID_key.AUTH_A, keya_ndef);
      if (!success) {
        serial.writeString("Authentication failed as NDEF key.\n");
        basic.showString("err")
        return;
      }
    }

    const NDEF_URIPREFIX_HTTP_WWWDOT = 1;

    serial.writeString("Found authentication key, writing URL...\n");
    success = RFID_MifareWriteNDEFURI(1, NDEF_URIPREFIX_HTTP_WWWDOT, url);
    if (success) {
      serial.writeString("Done writing URL: " + url + "\n");
      basic.showString("done")
    } else {
      serial.writeString("Write URL failed.\n");
      basic.showString("err")
    }
  }

}
