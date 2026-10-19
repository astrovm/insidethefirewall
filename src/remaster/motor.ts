// How Homer's car's engine sounds, like in The Simpsons: Hit & Run: it picks
// a gear from the speed, and the engine's pitch climbs through each gear,
// drops at each shift, revs in the air and while sliding, and whines in
// reverse. This works out how much faster or slower to play it, as `pitch`.

import { METER, TOP_SPEED_KMH, type Car } from "./car.ts";

/** The gear shift points, as parts of top speed, and each gear's pitch range. */
const SHIFT_POINTS = [0.01, 0.3, 0.45, 0.7, 0.85, 0.95, 1];
/** Guesses that suit a made-up engine. */
const GEAR_PITCH = [0.9, 2.1] as const;
const IDLE_PITCH = 0.8;
const REVERSE = { kmh: 50, pitch: [1.1, 2] } as const;
const IN_AIR = { gas: 2.2, idle: 0.9 } as const;
const POWERSLIDE = [0.9, 2.1] as const;
/** The pitch changes at most an octave in this long. */
const SECONDS_PER_OCTAVE = 0.5;

export class Motor {
  pitch = IDLE_PITCH;
  gear = 0;
  private lastKmh = 0;

  /** Moves the engine's sound along `dt` seconds, for this car with the gas held or not. */
  update(car: Car, gas: boolean, dt: number): number {
    const kmh = (Math.hypot(car.vx, car.vz) / METER) * 3.6;
    let wanted: number;
    if (car.speed < -1) {
      wanted = REVERSE.pitch[0] + Math.min(1, kmh / REVERSE.kmh) * (REVERSE.pitch[1] - REVERSE.pitch[0]);
      this.gear = 0;
    } else if (car.airborne) {
      wanted = gas ? IN_AIR.gas : IN_AIR.idle;
    } else if (car.skid > 0 && gas) {
      wanted = POWERSLIDE[0] + Math.min(1, kmh / TOP_SPEED_KMH) * (POWERSLIDE[1] - POWERSLIDE[0]);
    } else {
      this.gear = gearFor(kmh, this.lastKmh, this.gear);
      wanted = this.gear === 0 ? IDLE_PITCH : gearPitch(this.gear, kmh);
    }
    this.lastKmh = kmh;
    const most = dt / SECONDS_PER_OCTAVE;
    this.pitch += Math.max(-most, Math.min(most, wanted - this.pitch));
    return this.pitch;
  }
}

/** The gear for this speed. It doesn't shift down speeding up, or up slowing down. */
export function gearFor(kmh: number, lastKmh: number, lastGear: number): number {
  let gear = 0;
  while (gear < SHIFT_POINTS.length - 1 && kmh > TOP_SPEED_KMH * SHIFT_POINTS[gear]!) gear++;
  if (kmh > lastKmh && gear < lastGear) return lastGear;
  if (kmh <= lastKmh && gear > lastGear) return lastGear;
  return gear;
}

/** The pitch in `gear`, from the bottom of its range at its shift point to the top at the next. */
export function gearPitch(gear: number, kmh: number): number {
  const bottom = SHIFT_POINTS[gear - 1]! * TOP_SPEED_KMH;
  const top = SHIFT_POINTS[gear]! * TOP_SPEED_KMH;
  const through = Math.max(0, Math.min(1, (kmh - bottom) / (top - bottom)));
  return GEAR_PITCH[0] + (GEAR_PITCH[1] - GEAR_PITCH[0]) * through;
}
