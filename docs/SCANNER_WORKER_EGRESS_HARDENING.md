# Scanner worker egress hardening

Phase 1.1D pins every Node-owned scanner HTTP request to the public IP address
approved by `ScannerNetworkPolicy`. This covers robots, sitemaps, broken-link
checks, crawler discovery, and the Anthropic provider. The original hostname
is still used for HTTP `Host` and HTTPS SNI, so virtual-hosted public sites
continue to work.

Chromium is different: Playwright can intercept and validate URL requests and
WebSockets, but it does not expose a supported per-request DNS `lookup` hook
or a way to force a connection to a selected IP while retaining normal TLS/SNI
and Host semantics. Do not use `--host-resolver-rules` as a general runtime
solution: it is static, does not cover arbitrary dynamic hostnames safely, and
can break certificate validation. Chromium requests are revalidated at route
time; network egress controls below are mandatory defense in depth against a
DNS answer changing between route validation and connect.

## Required worker network policy

Apply these rules to the scanner-worker workload, not merely to the API:

- Default deny all egress.
- Permit TCP 80 and 443 to public Internet addresses only.
- Permit DNS only to the designated resolver(s), on UDP/TCP 53.
- Deny IPv4 private, loopback, link-local, CGNAT, multicast/reserved ranges:
  `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`,
  `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, and `224.0.0.0/4`.
- Deny IPv6 loopback, unspecified, unique-local, link-local, and multicast:
  `::1/128`, `::/128`, `fc00::/7`, `fe80::/10`, and `ff00::/8`.
- Explicitly deny cloud metadata endpoints, including `169.254.169.254/32`
  and `fd00:ec2::254/128`, even if a broader exception is later introduced.
- Deny all other destination ports. Do not allow database, Redis, SSH, or
  platform-admin ports simply because the worker runs in the same cluster.

Place scanner workers in a separate subnet/namespace/security group with no
route to the platform API, Postgres, Redis, object-store control plane, or
node/pod CIDRs. The worker may receive jobs through its dedicated queue path,
but that connection should be narrowly scoped by identity and port rather than
through broad east-west access.

## Kubernetes/CNI example

Use a CNI or cloud firewall that supports egress deny rules. A Kubernetes
`NetworkPolicy` can provide an allow-list baseline, but provider-specific
firewall rules are needed to guarantee IPv4 and IPv6 CIDR denies. Example
intent (substitute the DNS resolver CIDR; do not use this as a blanket allow):

```yaml
egress:
  - to:
      - ipBlock:
          cidr: 0.0.0.0/0
          except:
            - 0.0.0.0/8
            - 10.0.0.0/8
            - 100.64.0.0/10
            - 127.0.0.0/8
            - 169.254.0.0/16
            - 172.16.0.0/12
            - 192.168.0.0/16
            - 224.0.0.0/4
    ports:
      - { protocol: TCP, port: 80 }
      - { protocol: TCP, port: 443 }
  - to:
      - ipBlock: { cidr: 203.0.113.53/32 } # designated DNS resolver
    ports:
      - { protocol: UDP, port: 53 }
      - { protocol: TCP, port: 53 }
```

Validate these controls from a running worker with connection attempts to
metadata, RFC1918 addresses, the database/Redis service addresses, and a
public HTTPS endpoint. All but public HTTPS and the configured DNS resolver
must fail.
