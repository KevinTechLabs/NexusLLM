#!/bin/bash

until iptables -nL DOCKER-USER >/dev/null 2>&1; do
    sleep 1
done

iptables -C DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
iptables -I DOCKER-USER 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

iptables -C DOCKER-USER -s 192.0.2.20/32 -p tcp --dport 9001 -j ACCEPT 2>/dev/null || \
iptables -I DOCKER-USER -s 192.0.2.20/32 -p tcp --dport 9001 -j ACCEPT

iptables -C DOCKER-USER -p tcp --dport 9001 -j DROP 2>/dev/null || \
iptables -A DOCKER-USER -p tcp --dport 9001 -j DROP
