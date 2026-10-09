# Security-relevant hardware differences between GrapheneOS-supported Pixels (as of 9 Oct 2026)

**How this was researched.** grapheneos.org, discuss.grapheneos.org, Android Authority, 404 Media, PrivacyGear, Notebookcheck, PhoneArena, TechTimes, Wikipedia and others were blocked by the network egress proxy. So:
- **Official GrapheneOS text** comes from the website's source files on GitHub (`GrapheneOS/grapheneos.org`, branch `main`, HEAD commit `7a7e738`, fetched 2026-10-09): `static/faq.html`, `static/features.html` and `static/releases.html`. These are the files that generate grapheneos.org/faq, /features and /releases, so they are current as of the latest release, 2026100600. Below they are cited as [FAQ], [Features] and [Releases], with the canonical grapheneos.org URL.
- **Third-party claims** come from search-engine snippets and summaries of articles I could not open. They are marked "(snippet)" and should be weighted lower.

---

## 1. Hardware memory tagging (ARM MTE): which models have it, and how GrapheneOS uses it

### Takeaway
Every currently recommended device has hardware memory tagging, including the budget 'a' models. That covers the Pixel 8, 8 Pro, 8a, all Pixel 9 models (9a included) and all Pixel 10 models (10a included). GrapheneOS considers MTE a hard requirement. It is on by default for the kernel, the base OS, Vanadium and known-compatible apps, and users can opt into it for all apps. MTE is the main security line between 8th-gen-and-newer Pixels and the Pixel 6/7. The Pixel 11 (launched Aug 2026) is in doubt precisely because of MTE.

### Cited Findings
- FAQ, verbatim (current Oct 2026): "8th generation and later Pixels also have support for the incredibly powerful hardware memory tagging security feature as part of moving to new ARMv9 CPU cores. GrapheneOS uses hardware memory tagging by default to protect the base OS and known compatible user installed apps against exploitation, with the option to use it for all apps and opt-out on a case-by-case basis for the few incompatible with it. Pointer authentication, branch target identification and other ARM security features were also introduced at the same time." — [FAQ: recommended devices](https://grapheneos.org/faq#recommended-devices) (source: [GitHub faq.html](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html))
- The FAQ's list of requirements for future devices includes "Hardware memory tagging (ARM MTE or equivalent)". It says these standards are "met or exceeded by devices starting from Pixel 8 (shiba) through Pixel 10a (stallion)". The same list includes BTI/PAC hardware CFI, PAN/PXN, pKVM virtualization and isolated radios. — [FAQ: future devices](https://grapheneos.org/faq#future-devices)
- **hardened_malloc + MTE:** "Hardware memory tagging for slab allocations (128k and below) providing probabilistic detection of all use-after-free and inter-object overflows along with deterministic detection of all small/linear overflows and use-after-free until it has been reused once and gone through the quarantines twice." On ARMv9, BTI and PAC are also enabled for all userspace OS code. — [Features: exploit mitigations](https://grapheneos.org/features#exploit-mitigations)
- **Kernel MTE:** "Basic hardware memory tagging is used in the main kernel memory allocators (slab, page_alloc, non-executable vmalloc)". — [Features](https://grapheneos.org/features)
- **Vanadium (browser/WebView):** "Hardware memory tagging (MTE) enabled for the main allocator". — [Features: Vanadium](https://grapheneos.org/features#vanadium)
- **Apps:** MTE can't be disabled for the base OS or its apps. For user-installed apps there are per-app compatibility toggles, and memory-tagging crashes are always reported to the user. — [Features](https://grapheneos.org/features)
- **'a' models have MTE in practice.** The release notes show the kernel's MTE catching real bugs on the 8a and 9a. Release 2026050900 (May 2026): "kernel (Pixel 8a, Pixel 9a): fix for an upstream Broadcom Wi-Fi bcm4383 driver memory corruption bug to avoid invalid memory accesses caught by the kernel hardware memory tagging enabled by GrapheneOS". — [Releases](https://grapheneos.org/releases)
- MTE keeps finding real upstream bugs on Pixel 10 hardware, e.g. a DisplayPort driver out-of-bounds read (2026060100, 2026062800) and a Broadcom bcm4383 Wi-Fi bug on the Pixel 10 (2026062100). — [Releases](https://grapheneos.org/releases)
- Pixel 9 / 9 Pro / 9 Pro XL / 9 Pro Fold caveat: GrapheneOS once had to "temporarily disable hardened_malloc and hardware memory tagging for shared_modem_platform executable due to an upstream write-after-free bug" in the Exynos 5400 modem stack. This is an older Android 16-era note; whether it has since been re-enabled was not verified. — [Releases](https://grapheneos.org/releases)
- **Pixel 11 / Tensor G6 (launched Aug 2026), timeline:**
  - Jan 2026: reports said the Pixel 11 "could be the last new Pixel to gain GrapheneOS support". — [PiunikaWeb, 2026-01-26](https://piunikaweb.com/2026/01/26/pixel-11-could-be-the-last-new-pixel-to-gain-grapheneos-support/) (snippet)
  - ~31 Aug 2026: reports said Google removed MTE from the Pixel 11 and GrapheneOS advised against buying it. — [TechTimes, 2026-08-31](https://www.techtimes.com/articles/325985/20260831/google-removed-pixel-11-memory-safety-hardware-blocking-grapheneos-port.htm) (snippet); [it-connect](https://www.it-connect.tech/google-pixel-11-drops-mte-support-and-grapheneos-says-skip-it/) (snippet); [Notebookcheck: leaked documents show Google planned and then cut the feature](https://www.notebookcheck.net/Leaked-documents-show-Google-planned-and-then-cut-a-key-Pixel-11-security-feature-for-GrapheneOS.1382732.0.html) (snippet)
  - ~1 Sep 2026: after Android 17 QPR2 Beta 4 added the Pixel 11, GrapheneOS found references showing the hardware does have MTE. GrapheneOS called this "bare minimum", suspects Google removed most of the cache-level MTE acceleration to save cost, and is testing performance and whether it can force-enable MTE. — [Privacy Guides, 2026-09-01](https://www.privacyguides.org/news/2026/09/01/pixel-11-has-hardware-mte-support-may-still-be-usable-for-grapheneos/) (snippet); [Android Authority](https://www.androidauthority.com/grapheneos-pixel-11-mte-support-3707488/) (snippet); [Matrice Digitale, 2026-09-05](https://www.matricedigitale.it/2026/09/05/pixel-11-mte-grapheneos-support-tensor-g6/) (snippet); [Cybernews](https://cybernews.com/tech/pixel-11-hardware-support-for-mte/) (snippet)
- **Verified for 9 Oct 2026:** the latest GrapheneOS release, 2026100600, still lists only Pixel 6 through Pixel 10a; there is no Pixel 11. The FAQ's recommended list ends at Pixel 10a. — [Releases](https://grapheneos.org/releases), [FAQ](https://grapheneos.org/faq#supported-devices)

### Inferences
- MTE does not separate the 'a', base and Pro models within the 8, 9 or 10 generations. It only separates the 8th generation and later from the 6th/7th generation and from the Pixel 11, whose MTE is weaker or uncertain.
- For someone buying in Oct 2026, a Pixel 11 is a speculative bet. A Pixel 10-series or 9-series phone has proven MTE under GrapheneOS today.

### Gaps
- I could not confirm whether the Pixel 9's shared_modem_platform MTE exemption is still in place in Oct 2026.
- I have no official GrapheneOS statement after 25 Sep 2026 on Pixel 11 performance tests. One snippet said a GrapheneOS Pixel 11 page was "not yet confirmed, last reviewed 25 Sep 2026", but I could not open it.

---

## 2. Secure element (Titan M2), Weaver, insider attack resistance, attestation / Auditor

### Takeaway
Every supported 8th-, 9th- and 10th-gen Pixel uses the same Titan M2 secure element. All of them get Weaver-based throttling, insider attack resistance, StrongBox and hardware key attestation (Auditor). I found no evidence of a Titan M3 or other new secure element in the Pixel 10. The 10a has the same secure element as the 10 Pro. On secure-element features, all current models are equivalent.

### Cited Findings
- The FAQ's device requirements, which it says all devices from Pixel 8 to Pixel 10a meet:
  - "StrongBox keystore provided by secure element"
  - "Hardware key attestation support for the StrongBox keystore"
  - "Attest key support for hardware key attestation to provide pinning support"
  - "Weaver disk encryption key derivation throttling provided by secure element"
  - "Insider attack resistance for updates to the secure element (Owner user authentication required before updates are accepted)"
  - "Inline disk encryption acceleration with wrapped key support"
  - "Verified boot with rollback protection for firmware"

  — [FAQ: future devices](https://grapheneos.org/faq#future-devices)
- **How Weaver works:** "The OS stores a high entropy random value as the Weaver token on the secure element (Titan M on Pixels)… A secure internal timer is used to implement hardware-based delays… Only a total of 20 attempts is permitted." The delays escalate: 1–4 attempts get no delay, the 10th gets 4 h, the 13th 4 days, the 17th 1 year, the 19th 9 years, and there is no 20th attempt. "Deleting a profile will wipe the corresponding Weaver slot and a factory reset… wipes all of the Weaver slots. The secure element also provides insider attack resistance preventing firmware updates before authenticating with the owner profile." "GrapheneOS only officially supports devices with Weaver." — [FAQ: encryption](https://grapheneos.org/faq#encryption)
- The SoC's hardware-bound key derivation (TEE) is "meant to prevent offloading a brute force attack onto more powerful hardware". — [FAQ: encryption](https://grapheneos.org/faq#encryption)
- **Titan M2 by model:**
  - Pixel 10 series: Tensor G5 + Titan M2. — [GSMArena Pixel 10 Pro announcement](https://www.gsmarena.com/google_pixel_10_pro_and_pro_xl_announced_with_tensor_g5_new_telephoto_lens_and_bigger_batteries_-news-69134.php) / [PrivacyGear Pixel 10 review](https://privacygear.nl/en/reviews/pixel-10-grapheneos-review/) (snippets)
  - Pixel 10a: Tensor G4 + Titan M2. — [PrivacyGear Pixel 10a review](https://privacygear.nl/en/reviews/pixel-10a-grapheneos-review/) (snippet)
  - Pixel 9a: "same security hardware as the Pixel 9: Tensor G4, Titan M2, verified boot with user-configurable keys". — [PrivacyGear Pixel 9a review](https://privacygear.nl/en/reviews/pixel-9a-grapheneos-review/) (snippet)
- A third-party review describes the Pixel 10's Tensor G5 as, for GrapheneOS, "mostly an iterative step… not a fundamentally different security model". — [PrivacyGear Pixel 10 review](https://privacygear.nl/en/reviews/pixel-10-grapheneos-review/) (snippet)
- **Auditor app and attestation service:** they "provide strong hardware-based verification of the authenticity and integrity of the firmware/software on the device. A strong pairing-based approach is used which also verifies the device's identity based on the hardware-backed key generated for each pairing." — [Features: Auditor](https://grapheneos.org/features#auditor)
- **Duress PIN/password:** it wipes hardware keystore keys, including the ones used to derive the disk-encryption keys, then wipes eSIMs and shuts down. It works on all supported devices; it is not hardware-specific. — [Features](https://grapheneos.org/features), [Releases](https://grapheneos.org/releases)

### Inferences
- Choosing a/base/Pro within the 8th–10th generations makes no difference to brute-force resistance, attestation or insider attack resistance. All of them rely on the same Titan M2 plus Weaver design.

### Gaps
- No primary Google spec page could be opened to confirm "Titan M2" per model. The 10-series and 10a claims rest on third-party snippets.
- I found no information on whether the Pixel 11 changes the secure element.

---

## 3. Tensor G3 vs G4 vs G5, modems, USB-C port control, 2FA fingerprint, eSIM

### Takeaway
The CPU generation matters less for security than for performance, power use and support length. The security-relevant differences are:
1. **Modem.** The Pixel 9a uses the older Exynos 5300. The Pixel 9, 9 Pro and 10 series and the 10a use the Exynos 5400.
2. **USB-C stack maturity.** The Pixel 10 needed a new USB protection approach and had USB bugs that kept it experimental for a while, plus an open USB issue in Oct 2026.
3. **Update window.** The Pixel 10a's runs longest, to March 2033.

USB-C port control, 2FA fingerprint unlock and eSIM support are software features that work on all current models.

### Cited Findings
- **Chips:**
  - Tensor G5 (Pixel 10/Pro/Pro XL/Pro Fold) is made by TSMC. Most reports say 3 nm N3P; Notebookcheck said 5 nm; the sources conflict. — [9to5Google](https://9to5google.com/2025/06/03/google-pixel-10-tensor-g5-exynos-modem-leak/), [SamMobile](https://www.sammobile.com/news/google-tensor-g5-chip-samsung-exynos-5g-modem-tsmc-switch/), [Notebookcheck](https://www.notebookcheck.net/Google-Pixel-10-Tensor-G5-will-stick-with-the-same-Exynos-modem-found-on-the-Tensor-G4.1030148.0.html) (pre-launch June 2025 snippets)
  - Pixel 10a keeps the Tensor G4. — [GSMArena](https://m.gsmarena.com/newscomm-71611p2.php) (snippet)
- **Modems:**
  - Pixel 10 series: Exynos 5400 ("g5400"), the same modem as the Pixel 9 series. — [9to5Google, 2025-06-03](https://9to5google.com/2025/06/03/google-pixel-10-tensor-g5-exynos-modem-leak/) (snippet)
  - Pixel 9a: Google confirmed the older Exynos 5300, which has no satellite support. — [Android Authority](https://www.androidauthority.com/google-pixel-9a-modem-3535985/), [Android Central](https://www.androidcentral.com/phones/google/google-pixel-9a-past-gen-exynos-modem-confirmation) (snippets)
  - Pixel 10a: Google told Android Authority it uses the Exynos 5400, so it gains Satellite SOS. — [Android Authority](https://www.androidauthority.com/google-pixel-10a-modem-3639784/) (snippet)
- **Modem isolation** is a GrapheneOS requirement met by all supported Pixels: "Isolated radios (cellular, Wi-Fi, Bluetooth, NFC, etc.), GPU, SSD, media encode and decode, image processor and other components". — [FAQ](https://grapheneos.org/faq#future-devices)
- **USB-C port control (all models):**
  - It has five modes. The default, "Charging-only when locked", "blocks any new USB connections immediately… at both the hardware level via configuring the USB controller and also at the OS level in the kernel… disables the data lines at a hardware level as soon as the existing connections end". It also disables DisplayPort alternate modes. "Off" also disables charging and USB-PD. — [Features: USB-C port](https://grapheneos.org/features#usb-c-port-and-pogo-pins-control)
  - The FAQ requirement is "Support for disabling USB data and also USB as a whole at a hardware level in the USB controller". — [FAQ](https://grapheneos.org/faq#future-devices)
- **Pixel 10 USB caveats:**
  - Release 2026010800 (Jan 2026): "add an extra layer of USB port protection on 10th gen Pixels based on upstream functionality to replace our USB gadget control which was causing compatibility issues with the Pixel 10 USB drivers". — [Releases](https://grapheneos.org/releases)
  - GrapheneOS had said USB connectivity was "the main reason Pixel 10 support is still marked as experimental". — [PiunikaWeb, 2026-01-02](https://piunikaweb.com/2026/01/02/grapheneos-explains-why-pixel-10-stable-builds-are-delayed-and-when-to-expect-camera-parity/) (snippet)
  - Open issue #8892, filed against build 2026100201 (Oct 2026): "USB-C data, DisplayPort and Ethernet stay disabled after unlocking from lockdown mode until reboot (Pixel 10)". This fails closed, so it is a usability bug, not a security hole. — [GitHub os-issue-tracker #8892](https://github.com/GrapheneOS/os-issue-tracker/issues/8892) (snippet)
- **Support timeline:**
  - Pixel 10, 10 Pro, 10 Pro XL, 10 Pro Fold: experimental support from 2025120400, after standalone experimental builds 2025112500 and 2025113000. — [Releases](https://grapheneos.org/releases)
  - Pixel 10a: experimental support from 2026032000 (Mar 2026). — [Releases](https://grapheneos.org/releases)
  - As of Oct 2026, the FAQ lists all of them under "official production support". — [FAQ: supported devices](https://grapheneos.org/faq#supported-devices)
- **Two-factor fingerprint unlock (all models):** "require entering a 2nd factor PIN after successfully authenticating with a fingerprint… Failure to enter the correct PIN counts towards the standard attempt limit." A duress PIN entered as the 2FA PIN also wipes the device. — [Features: 2FA fingerprint](https://grapheneos.org/features#two-factor-fingerprint-unlock)
- **eSIM (all models):**
  - eSIM activation is an optional toggle, isolated from other apps. The Pixel eSIM firmware app is enabled by default and restricted. — [Releases](https://grapheneos.org/releases)
  - The special Skylo satellite eSIM on 9th/10th-gen Pixels is hidden from regular eSIM erase. — [Releases](https://grapheneos.org/releases)
  - Release 2026072900 (Jul 2026) added feature flags for the "Pixel NFC/eSE/eSIM firmware updater". — [Releases](https://grapheneos.org/releases)
- **Memory scrubbing (all models):** auto-reboot is on by default (18 h; configurable from 10 min to 72 h), and freed memory is zeroed in both the kernel and userspace allocators. — [Features](https://grapheneos.org/features)
- **Minimum support end dates (OEM; GrapheneOS updates usually end shortly after):**

  | Model | Support ends |
  |---|---|
  | Pixel 10a | March 2033 |
  | Pixel 10 Pro Fold | October 2032 |
  | Pixel 10, 10 Pro, 10 Pro XL | August 2032 |
  | Pixel 9a | April 2032 |
  | Pixel 9, 9 Pro, 9 Pro XL, 9 Pro Fold | August 2031 |
  | Pixel 8a | May 2031 |
  | Pixel 8, 8 Pro | October 2030 |

  All are 7-year guarantees. — [FAQ: device lifetime](https://grapheneos.org/faq#device-lifetime)

### Inferences
- The best modem among current models is the Exynos 5400 (all 9 non-a, all 10 incl. 10a). I found no public analysis showing either Exynos modem is more secure. The 5300's drawbacks that are documented are reception, battery life and no satellite, not security.
- Since 2026 the Pixel 10 series has the newest SoC but the least-mature GrapheneOS USB/driver stack. The Pixel 9 and 10a sit on the more mature Tensor G4 code base.

### Gaps
- I found no source confirming eSIM-only US models or Qi2-related security issues on the Pixel 10. Search results had nothing on them, so I can't make claims about them.
- I found no primary source for RAM per model. Search snippets say the 8a and 9a have 8 GB. The 10a's RAM and the Pixel 10/10 Pro's RAM (likely 12/16 GB) are unverified.
- I found no source comparing modem attack surface between the Exynos 5300 and 5400.

---

## 4. Known weaknesses and forensic extraction resistance (Cellebrite leaks)

### Takeaway
Leaked Cellebrite documents from 2024 to Oct 2025 consistently show that patched GrapheneOS Pixels can't be extracted. Cellebrite reported success only against GrapheneOS builds older than late 2022. The Pixel 10 is not in any leaked matrix, and I found no 2026 Cellebrite leak covering it. Each budget model has specific weaknesses:
- Pixel 9a: older modem, 8 GB RAM, shorter support than the 10a, discontinued Mar 2026.
- Pixel 8a: Tensor G3, shortest support among 'a' models (May 2031), sold only used now.
- Pixel 10a: older Tensor G4 rather than the G5.
- Pixel 10 series: early USB driver issues.

### Cited Findings
- **Oct 2025 leak:** someone joined a Cellebrite Microsoft Teams call and leaked the "Android OS Access Support Matrix" to the GrapheneOS forum. It showed stock Pixels extractable in BFU, AFU and unlocked states. Locked Pixel 9s on GrapheneOS were listed as inaccessible. GrapheneOS was only accessible on builds with roughly 2022 patch levels, and even unlocked GrapheneOS devices yielded limited data. The matrix covered Pixel 6 through Pixel 9, not the Pixel 10. Cellebrite said "We do not disclose or publicize the specific capabilities of our technology." — [404 Media](https://www.404media.co/someone-snuck-into-a-cellebrite-microsoft-teams-call-and-leaked-phone-unlocking-details/), [Android Authority](https://www.androidauthority.com/cellebrite-leak-google-pixel-grapheneos-security-3611794/), [Slashdot, 2025-10-31](https://tech.slashdot.org/story/25/10/31/0028256), [HN thread](https://news.ycombinator.com/item?id=45766501) (snippets)
- **Feb 2025 matrix:** again showed GrapheneOS not exploitable. — [Privacy Guides forum](https://discuss.privacyguides.net/t/updated-cellebrite-google-pixel-matrix-leak-february-2025/25911) (snippet)
- **Apr 2024 document:** reportedly said Cellebrite could not brute-force powered-off Pixel 6/7/8. — (summarized in the same snippet set; primary not opened)
- **GrapheneOS on X:** Cellebrite documentation "shows they've been unable to bypass brute force protection on the Pixel 6 or later or iPhone 12 or later". — [GrapheneOS on X](https://x.com/GrapheneOS/status/1965464817914831070) (snippet; vendor claim, not independently verified)
- **eSIMs:** reportedly, law enforcement also cannot copy eSIMs from Pixel devices. — [Cellebrite coverage](https://www.androidauthority.com/cellebrite-leak-google-pixel-grapheneos-security-3611794/) (snippet)
- **Pixel 9a:**
  - Exynos 5300 modem with no satellite; reception and battery complaints carried over from Pixel 6/8-era 5300 devices. — [Android Police](https://www.androidpolice.com/google-pixel-9a-exynos-modem-5300-downgrade/) (snippet)
  - Listed as discontinued 5 Mar 2026. — [Wikipedia Pixel 9a](https://en.wikipedia.org/wiki/Pixel_9a) (snippet)
  - Per one review, its only feature loss versus the Pixel 9 is UWB, which is not security-relevant. — [PrivacyGear 9a review](https://privacygear.nl/en/reviews/pixel-9a-grapheneos-review/) (snippet)
- **Pixel 8a:** only available second-hand now. — [PrivacyGear 8a review](https://privacygear.nl/en/reviews/pixel-8a-grapheneos-review/) (snippet)
- **Pixel 10a:** a GrapheneOS release fixed a Pixel 10a GNSS HAL mismatch that produced inaccurate GNSS data, and added missing SELinux policy for Pixel Camera TPU use. These are early-port bugs that have since been fixed. — [Releases](https://grapheneos.org/releases)
- **Pixel 11:** see section 1. MTE was reported removed (31 Aug 2026), then found present but minimal (1–5 Sep 2026). Not supported as of release 2026100600.
- **Broader context:** GrapheneOS is working with Motorola on devices meeting its requirements, expected in 2027. — [WinFuture](https://winfuture.de/news,154242.html), [efani](https://www.efani.com/blog/grapheneos-supported-devices) (snippets)

### Inferences
- The leaks suggest forensic resistance comes mainly from the shared Titan M2/Weaver design plus GrapheneOS software: patch speed, auto-reboot, USB-C blocking, zeroing and MTE. It does not come from per-model hardware. Any 8th–10th-gen model should therefore behave the same, though Pixel 10 data is absent.

### Gaps
- There is no 2026 Cellebrite or GrayKey leak covering the Pixel 10 or 10a.
- I could not open the 404 Media article to confirm the exact cell-by-cell matrix values.
- I could not verify any Pixel 10-specific Qi2, eSIM-only or modem security problems.

---

## 5. What GrapheneOS developers say about choosing between the 'a', base and Pro models

### Takeaway
GrapheneOS recommends every 8th-, 9th- and 10th-gen Pixel equally on security grounds. Its stated criteria are hardware security (MTE and the other requirements) and the length of the minimum support guarantee. It doesn't rank a, base and Pro against each other on security. By its own criteria, the newest generation is best, and within it the support end date is the tie-breaker. That makes the Pixel 10a (Mar 2033) the longest-supported model, with the Pixel 10/Pro next (Aug 2032, plus the newer G5 SoC).

### Cited Findings
- FAQ, verbatim: "We strongly recommend only purchasing one of the following devices for GrapheneOS due to better security and a long minimum support guarantee from launch for full security updates". The list that follows runs Pixel 10a, 10 Pro Fold, 10 Pro XL, 10 Pro, 10, 9a, 9 Pro Fold, 9 Pro XL, 9 Pro, 9, 8a, 8 Pro, 8. — [FAQ: recommended devices](https://grapheneos.org/faq#recommended-devices)
- GrapheneOS on X, ~Mar 2026: "Pixels meet our security requirements and will continue to be supported. We're going to be adding Pixel 10a support in the near future." — [GrapheneOS on X](https://x.com/GrapheneOS/status/2028475484460466286) (snippet)
- Third-party views:
  - PrivacyGear calls the Pixel 10a "currently the best value" GrapheneOS device. — [PrivacyGear Pixel 11 review](https://privacygear.nl/en/reviews/pixel-11-grapheneos-review/) (snippet)
  - Coverage of the Pixel 11 situation points buyers to the Pixel 9/10 series. — [todoandroid.es (CZ)](https://cs.todoandroid.es/Grapheneos-se-lou%C4%8D%C3%AD-s-Pixelem-11%3B-absence-MTE-p%C5%99eru%C5%A1uje-desetilet%C3%AD-trvaj%C3%ADc%C3%AD-alianci/), [TechTimes](https://www.techtimes.com/articles/325985/20260831/google-removed-pixel-11-memory-safety-hardware-blocking-grapheneos-port.htm) (snippets)
- There is a GrapheneOS forum thread comparing the "Pixel 10 vs Pixel 10a", but I could not open it. — [discuss.grapheneos.org/d/31615](https://discuss.grapheneos.org/d/31615-google-pixel-10-vs-google-pixel-10a)
- FAQ carrier caveat: carrier-locked devices, mainly in the US, may block installing GrapheneOS, so buy unlocked. — [FAQ](https://grapheneos.org/faq#supported-devices)

### Inferences
- **Recommendation for best security/privacy under GrapheneOS, Oct 2026:**
  - **Top tier:** Pixel 10 / 10 Pro / 10 Pro XL. They have the newest SoC, the Exynos 5400 modem, MTE, Titan M2, support to Aug 2032, and are now production-supported. The Pro models differ from the base Pixel 10 in cameras, RAM and size, not in security hardware.
  - **Close second:** Pixel 10a. It has identical secure-element and MTE features, the Exynos 5400 modem, the longest support (Mar 2033) and a lower price, but the older Tensor G4. On security alone it is roughly equal to the Pixel 10. It is arguably best per euro and per year of support.
  - **Pixel 9a:** acceptable, but the Exynos 5300 modem and 8 GB RAM are drawbacks and it is discontinued.
  - **Pixel 8/8a:** still recommended, but have the shortest support (2030–2031).
  - **Avoid the Pixel 11** until GrapheneOS confirms support.

### Gaps
- I couldn't access discuss.grapheneos.org or GrapheneOS's Mastodon/Bluesky posts, so I have no verbatim developer quotes comparing a vs base vs Pro.
- I found no explicit GrapheneOS statement ranking the Pixel 10 above the 10a or vice versa.
