# Load cells → HX711 → ESP32 wiring

This note covers a **four-corner kitchen scale** with **four 3-wire load cells** (wires often labeled **red, white, black**) wired as **one full Wheatstone bridge** into a single **HX711** module, then to an **ESP32 DevKit** (or compatible ESP32 dev board).

---

## 1. Text description

### 1.1 What the three wires usually are

Inside each cell, two strain gauges share a **common** node. You see three conductors:

| Wire (typical kit colors) | Electrical role (common pattern) |
|---------------------------|----------------------------------|
| **Red** | Excitation **+** (one “corner” of the half-bridge) |
| **Black** | Excitation **−** (the other excitation corner) |
| **White** | **Signal** tap (midpoint between the two gauges) |

**Important:** Colors are **not standardized**. Before soldering, confirm with a **multimeter** (power off): you should see a **symmetric resistance pattern** between pairs of wires. If your cell’s datasheet disagrees, follow the datasheet and map **E+ / E− / Sig** mentally onto this document’s roles.

### 1.2 Why four 3-wire cells match one HX711 channel

A **full bridge** needs four active legs. Each **3-wire half-bridge cell** contributes **two strain gauge elements**. With **four cells** under the platform, the usual layout is a **rectangle**: excitation is bused to all cells, and the four **signal taps** are paired so two pairs form the differential **A+** and **A−** inputs of the HX711.

### 1.3 Bridge wiring (standard four-corner pattern)

Treat the four cells as **FL, FR, BL, BR** (front-left, front-right, back-left, back-right as you look at the scale).

1. **Bus excitation (parallel)**  
   - Connect **all four “E+” wires** (often red) together → **HX711 `E+`**.  
   - Connect **all four “E−” wires** (often black) together → **HX711 `E−`**.

2. **Differential signal (diagonal pairing)**  
   - **White** from **FL** and **BR** → tie together → **HX711 `A+`**.  
   - **White** from **FR** and **BL** → tie together → **HX711 `A−`**.

This diagonal pairing matches the usual mechanical orientation so opposite corners share bending in a way that sums correctly into one bridge.

**If the reading moves the wrong way when you load the platform**, swap **`A+` and `A−`**.  
**If the reading is noisy or barely changes**, check that whites are **diagonal** (not accidentally both on the same side), and that all four cells sit with the same “load direction” (not one mounted flipped).

### 1.4 HX711 → ESP32

HX711 modules expose **serial interface** pins (names vary slightly by PCB silkscreen):

| HX711 pin | Connect to ESP32 |
|-----------|------------------|
| `VCC` | `3.3 V` (simplest with 3.3 V logic) **or** `5 V` if your module and wiring are verified for that supply |
| `GND` | `GND` |
| `DT` / `DOUT` / `DO` | A **GPIO** you choose for data (example: `GPIO4`) |
| `SCK` / `CLK` | A **GPIO** you choose for clock (example: `GPIO16`) |

Use **short wires** for DT/SCK and a **common ground** between HX711 and ESP32.

**Logic level:** ESP32 I/O is **3.3 V**. If you power the HX711 at **5 V**, check whether `DOUT` is **5 V** when high on your module; if so, use **3.3 V supply for HX711**, add a **level shifter**, or verify your specific board’s behavior before relying on it.

**Channel B:** Unused for this single-bridge setup; leave unconnected unless you add a second sensor.

### 1.5 Physical tips

- **Star ground** at the ESP32/HX711 area helps reduce noise.  
- Keep **analog bridge wires** (E+/E−/A+/A−) away from **Wi-Fi antenna** and switching power traces if possible.  
- **Twist** or keep **DT/SCK** as a pair to reduce pickup.

---

## 2. Diagrams

### 2.1 ASCII — signal side to ESP32

```
   HX711                    ESP32 DevKit
  ---------                 ------------
  VCC ---------- 3V3 ------- 3.3V
  GND ---------- GND ------- GND
  DT  ---------- GPIO ------ GPIO4
  SCK ---------- GPIO ------ GPIO16
```

---

## 3. Quick checklist

- [ ] Verified wire roles with **meter** or **datasheet** (not colors alone).  
- [ ] All four **E+** and all four **E−** bused correctly.  
- [ ] **Whites** paired **FL+BR** → `A+`, **FR+BL** → `A−` (adjust if your mechanical layout differs).  
- [ ] HX711 **VCC/GND** and **DT/SCK** to ESP32 with **common ground**.  
- [ ] Firmware GPIO matches the pins you wired for **DT** and **SCK**.

For other assets in this folder, see [README.md](README.md).
