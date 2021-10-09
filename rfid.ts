// MakerBit blocks supporting an I2C LCD 1602 display

const enum LcdPosition1602 {
  //% block="1"
  Pos1 = 1,
  //% block="2"
  Pos2 = 2,
  //% block="3"
  Pos3 = 3,
  //% block="4"
  Pos4 = 4,
  //% block="5"
  Pos5 = 5,
  //% block="6"
  Pos6 = 6,
  //% block="7"
  Pos7 = 7,
  //% block="8"
  Pos8 = 8,
  //% block="9"
  Pos9 = 9,
  //% block="10"
  Pos10 = 10,
  //% block="11"
  Pos11 = 11,
  //% block="12"
  Pos12 = 12,
  //% block="13"
  Pos13 = 13,
  //% block="14"
  Pos14 = 14,
  //% block="15"
  Pos15 = 15,
  //% block="16"
  Pos16 = 16,
  //% block="17"
  Pos17 = 17,
  //% block="18"
  Pos18 = 18,
  //% block="19"
  Pos19 = 19,
  //% block="20"
  Pos20 = 20,
  //% block="21"
  Pos21 = 21,
  //% block="22"
  Pos22 = 22,
  //% block="23"
  Pos23 = 23,
  //% block="24"
  Pos24 = 24,
  //% block="25"
  Pos25 = 25,
  //% block="26"
  Pos26 = 26,
  //% block="27"
  Pos27 = 27,
  //% block="28"
  Pos28 = 28,
  //% block="29"
  Pos29 = 29,
  //% block="30"
  Pos30 = 30,
  //% block="31"
  Pos31 = 31,
  //% block="32"
  Pos32 = 32
}

//% color=#0fbc11 icon="\u272a" block="MakerBit"
//% category="MakerBit"
namespace makerbit {

  /**
   * Clears the LCD1602 completely.
   */
  //% subcategory="RFID"
  //% blockId="makerbit_rfid_get_uuid" block="RFID UUID"
  //% weight=89
  export function rfidGetUUID(): void {
//    showStringOnLcd1602("", 1, 32);
  }

}
