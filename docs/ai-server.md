# AI Server

## Identity

- Hostname: `Nexus-Ai`
- LAN IP: `192.0.2.10`
- Tailscale IP: `198.51.100.10`

## Hardware

- NVIDIA RTX 4070
- 12 GB VRAM
- 32 GB DDR5 RAM
- 1 TB SSD
- Ethernet
- Dedicated 24/7 operation

## Operating System

- Ubuntu 26.04.1 LTS
- Kernel: 7.0.8-31-generic

## NVIDIA

- Driver: 595.91.07
- CUDA: 13.2
- NVIDIA Container Toolkit: 1.20.1

The host and NVIDIA containers have been verified with `nvidia-smi`.

## Docker

- Docker Engine: 29.8.1
- Docker enabled at boot

The NVIDIA container runtime was tested successfully with a CUDA container.

## Remote Access

Tailscale is installed and configured.

Open WebUI is reachable remotely through:

`http://198.51.100.10:3000`

No public Internet exposure is intended.
