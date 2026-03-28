# Minimum Verified Smoke Pair Guide

- Status: Draft
- Date: 2026-03-28
- Audience: beginner users

## What this guide covers

This guide is for the **smallest hardware setup that ClaRTK can truthfully describe today without guessing**.

It is called a "smoke pair" because it proves the tracked build workflow on a bench before any larger field build.

## Hardware used in this guide

Verified in the current canonical inventory database:

- `smoke-navspark-base`
- `smoke-navspark-rover`
- `smoke-xbee-base`
- `smoke-xbee-rover`

## Before you touch any wires

You must answer these yes/no questions first:

| Question | Why it matters |
|---|---|
| Do you have two active GNSS antennas? | The PX1122R documentation says an active antenna is required |
| Can you read the exact label on each Digi radio? | The current inventory naming does not pin the exact submodel |
| Do you have a known-good `5V +/-5%` power source for the GNSS boards? | The official PX1122R board documentation lists `5V +/-5%` input |
| Do you have the correct USB/serial adapter path for the radio side? | Current canonical inventory does not yet prove the adapter kit |

If any answer is "no", stop here and resolve the blocker before wiring.

## What the finished bench setup should look like

The goal is:

- one GNSS board acting as the base,
- one GNSS board acting as the rover,
- one radio attached to each side,
- each side tracked in ClaRTK as part of one build session.

See:

- [minimum-verified-smoke-pair.svg](../diagrams/minimum-verified-smoke-pair.svg)

## Beginner step-by-step sequence

### Step 1: Put the four tracked parts on the table

Lay out:

- `smoke-navspark-base`
- `smoke-navspark-rover`
- `smoke-xbee-base`
- `smoke-xbee-rover`

Do not power anything yet.

### Step 2: Add labels you can read easily

Use masking tape or stick-on labels if needed.

Write:

- `BASE GNSS`
- `ROVER GNSS`
- `BASE RADIO`
- `ROVER RADIO`

This sounds simple, but it prevents the most common beginner mistake: swapping sides halfway through setup.

### Step 3: Check the radio label

Look at each Digi radio and write down:

- exact model text,
- part number,
- any firmware or sticker number.

The current ClaRTK docs do not yet prove the exact submodel, so this human check is required.

### Step 4: Check for antennas

Find two active GNSS antennas.

Why:

- the official PX1122R documentation says an active antenna is required.

If you cannot find two antennas, stop.

### Step 5: Create the build record first

ClaRTK wants the build tracked before the bench session becomes messy.

Plain-language workflow:

1. Create one build record.
2. Attach the base unit and rover unit to that build.
3. Let ClaRTK queue the hardware stages:
   - `hardware.prepare`
   - `hardware.reserve_parts`
   - `hardware.build`
   - `hardware.bench_validate`

The build-state flow is here:

- [build-lifecycle.svg](../diagrams/build-lifecycle.svg)

## What you should record during assembly

Keep a simple bench note with:

- date
- your name
- exact unit labels used
- exact radio label text
- whether antennas were present
- what power source was used
- what failed, if anything failed

That note is more important than trying to memorize the steps.

## What ClaRTK will track for you

ClaRTK can already track:

- the parts,
- the units,
- the build record,
- the build events,
- the build status progression.

It should not be used as an excuse to skip labeling or note-taking.

## Safe stop points

Stop immediately if:

- you cannot confirm the radio model,
- you do not have active antennas,
- you cannot prove the GNSS board power source,
- the parts on the table do not match the unit labels in inventory.

## Truthful scope limit

This guide does **not** include exact pin-by-pin wiring instructions yet.

Reason:

- the current canonical inventory does not yet verify all supporting parts,
- the current canonical inventory does not yet pin the exact Digi radio submodel,
- giving exact wiring directions without those confirmations would require guessing.
