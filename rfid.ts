// MakeCode extension for PN532 NFC RFID module


//% color=#0fbc11 icon="\u272a" block="MakerBit"
//% category="MakerBit"
namespace makerbit {

  /**
   * Get the UUID from an RFID. v006
   */
  //% subcategory="RFID"
  //% blockId="makerbit_rfid_get_uuid"
  //% block="RFID UUID"
  //% weight=89
  export function rfidGetUUID(): number {
    let bufr = pins.i2cReadBuffer(0x24, 13, false);
    return bufr[0];
  }

}
