/**
 * EVE hardware reference profile and physical feasibility calculations.
 *
 * Every number carries a source classification:
 *   datasheet            — quoted from a manufacturer document
 *   reference-profile    — engineering assumption for the reference prototype
 *   simulation-parameter — used by the RTL/simulator models
 *   measured             — produced by the local toolchain at runtime
 *
 * The default target is deliberately NOT production qualified. Package,
 * ordering code, speed grade and pin assignment are null until a schematic and
 * pinout are verified.
 */

export const QUALIFICATION = Object.freeze({
  QUALIFIED: 'QUALIFIED',
  REFERENCE_PROFILE: 'REFERENCE PROFILE — PACKAGE/PINOUT NOT QUALIFIED',
  INCOMPLETE: 'INCOMPLETE CONFIGURATION',
});

export const TARGET_SCHEMA_VERSION = 1;

export const VIDEO_PROFILES = Object.freeze({
  '1080p30': {
    id: '1080p30',
    label: '1920x1080 @ 30 Hz',
    width: 1920,
    height: 1080,
    refreshRate: 30,
    pixelClockHz: 74250000,
    hActive: 1920,
    hFrontPorch: 88,
    hSync: 44,
    hBackPorch: 148,
    hTotal: 2200,
    vActive: 1080,
    vFrontPorch: 4,
    vSync: 5,
    vBackPorch: 36,
    vTotal: 1125,
    hSyncPolarity: 'positive',
    vSyncPolarity: 'positive',
    source: 'reference-profile',
  },
  '720p60': {
    id: '720p60',
    label: '1280x720 @ 60 Hz',
    width: 1280,
    height: 720,
    refreshRate: 60,
    pixelClockHz: 74250000,
    hActive: 1280,
    hFrontPorch: 110,
    hSync: 40,
    hBackPorch: 220,
    hTotal: 1650,
    vActive: 720,
    vFrontPorch: 5,
    vSync: 5,
    vBackPorch: 20,
    vTotal: 750,
    hSyncPolarity: 'positive',
    vSyncPolarity: 'positive',
    source: 'datasheet',
  },
  'fast-functional': {
    id: 'fast-functional',
    label: '320x180 scaled timing (simulation only)',
    width: 320,
    height: 180,
    refreshRate: 60,
    pixelClockHz: 25200000,
    hActive: 320,
    hFrontPorch: 16,
    hSync: 16,
    hBackPorch: 48,
    hTotal: 400,
    vActive: 180,
    vFrontPorch: 2,
    vSync: 2,
    vBackPorch: 16,
    vTotal: 200,
    hSyncPolarity: 'positive',
    vSyncPolarity: 'positive',
    source: 'simulation-parameter',
  },
});

export const DEVICE_SPECS = Object.freeze({
  fpga: {
    vendor: 'Gowin',
    family: 'GW1N',
    device: 'GW1N-4',
    lut4: 4608,
    blockSramBits: 180 * 1024,
    blockSramBytes: (180 * 1024) / 8,
    multipliers18x18: 16,
    plls: 2,
    source: 'datasheet',
    reference: 'https://www.gowinsemi.com/upload/database_doc/1753/document/69dda0d1672e8.pdf',
    note: 'Family-level resource counts. Available I/O depends on the exact package; never use a family-wide GPIO maximum for a design budget.',
  },
  rom: {
    vendor: 'Winbond',
    device: 'W25Q128JV',
    capacityBytes: 16 * 1024 * 1024,
    capacityBits: 128 * 1024 * 1024,
    pageBytes: 256,
    sectorBytes: 4096,
    block32Bytes: 32768,
    block64Bytes: 65536,
    clockMaxQspiReadHz: 133000000,
    quotedQuadReadBytesPerSecond: 66000000,
    voltageMin: 2.7,
    voltageMax: 3.6,
    source: 'datasheet',
    reference: 'https://www.winbond-electronics.com/pdf-7d/w25q128jvsjq.pdf',
  },
  ram: {
    vendor: 'ISSI',
    device: 'IS42S16400J-6',
    capacityBytes: 8 * 1024 * 1024,
    capacityBits: 64 * 1024 * 1024,
    banks: 4,
    rows: 4096,
    columns: 256,
    busWidth: 16,
    organization: '1M x 16 x 4 banks',
    voltage: 3.3,
    speedGradeMHz: 166,
    casLatencyAt166: 3,
    source: 'datasheet',
    reference: 'https://www.issi.com/ww/pdf/42-45s16400j.pdf',
    note: 'The -6 speed-grade timing table must be re-verified against the exact datasheet revision before PCB sign-off.',
  },
  hdmi: {
    vendor: 'Analog Devices',
    device: 'ADV7513',
    inputBusWidth: 24,
    maxInputClockHz: 165000000,
    inputFormat: 'RGB 4:4:4',
    controlBus: 'I2C',
    source: 'datasheet',
    reference: 'https://www.analog.com/media/en/technical-documentation/data-sheets/ADV7513.pdf',
    note: 'TMDS serialization is performed by the ADV7513. Commercial deployment requires HDMI adoption/licensing review.',
  },
  mcu: {
    vendor: 'Espressif',
    family: 'ESP32-S3',
    module: 'ESP32-S3-WROOM-1',
    framework: 'Arduino',
    source: 'datasheet',
  },
});

export const REFERENCE_TARGET = Object.freeze({
  schemaVersion: TARGET_SCHEMA_VERSION,
  targetName: 'EVE Reference Prototype',
  qualification: QUALIFICATION.REFERENCE_PROFILE,
  fpga: {
    family: 'GOWIN GW1N',
    device: 'GW1N-4',
    fullOrderingCode: null,
    package: null,
    speedGrade: null,
    clockHz: 100000000,
    pins: null,
  },
  mcu: {
    family: 'ESP32-S3',
    module: 'ESP32-S3-WROOM-1',
    framework: 'Arduino',
    spiClockHz: 10000000,
    pins: null,
  },
  rom: {
    device: 'W25Q128JV',
    capacityBytes: 16777216,
    interface: 'QSPI',
    clockHz: 50000000,
  },
  ram: {
    device: 'IS42S16400J-6',
    capacityBytes: 8388608,
    busWidth: 16,
    clockHz: 166000000,
    casLatency: 3,
  },
  video: {
    transmitter: 'ADV7513',
    profile: '1080p30',
    width: 1920,
    height: 1080,
    refreshRate: 30,
    pixelClockHz: 74250000,
  },
  derived: {
    rendererLogicalWidth: 1920,
    rendererLogicalHeight: 1080,
    lineBufferCount: 2,
    colorFormat: 'RGB888 output from RGB565 line composition',
  },
});

export function cloneReferenceTarget() {
  return JSON.parse(JSON.stringify(REFERENCE_TARGET));
}

export const REQUIRED_PIN_ROLES = Object.freeze([
  'host_sclk',
  'host_cs_n',
  'host_mosi',
  'host_miso',
  'host_ready',
  'host_irq',
  'host_reset_n',
  'flash_cs_n',
  'flash_clk',
  'flash_io0',
  'flash_io1',
  'flash_io2',
  'flash_io3',
  'sdram_clk',
  'sdram_cke',
  'sdram_cs_n',
  'sdram_ras_n',
  'sdram_cas_n',
  'sdram_we_n',
  'sdram_ba0',
  'sdram_ba1',
  'sdram_a0',
  'sdram_a1',
  'sdram_a2',
  'sdram_a3',
  'sdram_a4',
  'sdram_a5',
  'sdram_a6',
  'sdram_a7',
  'sdram_a8',
  'sdram_a9',
  'sdram_a10',
  'sdram_a11',
  'sdram_dq0',
  'sdram_dq15',
  'sdram_dqm0',
  'sdram_dqm1',
  'hdmi_rgb0',
  'hdmi_rgb23',
  'hdmi_hsync',
  'hdmi_vsync',
  'hdmi_de',
  'hdmi_pclk',
  'hdmi_i2c_scl',
  'hdmi_i2c_sda',
  'osc_25mhz',
]);

export function validateTarget(target = REFERENCE_TARGET) {
  const errors = [];
  const warnings = [];
  if (!target.fpga) errors.push('Missing FPGA configuration');
  if (!target.mcu) errors.push('Missing MCU configuration');
  if (!target.rom) errors.push('Missing ROM configuration');
  if (!target.ram) errors.push('Missing RAM configuration');
  if (!target.video) errors.push('Missing video configuration');

  if (target.fpga) {
    if (!target.fpga.fullOrderingCode) warnings.push('FPGA full ordering code is not set');
    if (!target.fpga.package) warnings.push('FPGA package is not set');
    if (!target.fpga.speedGrade) warnings.push('FPGA speed grade is not set');
    if (!target.fpga.pins) warnings.push('FPGA pin assignment is not verified');
  }
  if (target.mcu && !target.mcu.pins) warnings.push('MCU pin assignment is not verified');
  if (target.video) {
    const profile = VIDEO_PROFILES[target.video.profile] || null;
    if (!profile) warnings.push(`Unknown video profile ${target.video.profile}`);
    else {
      const expected = profile.hTotal * profile.vTotal * profile.refreshRate;
      if (expected !== profile.pixelClockHz) {
        warnings.push(`Video profile pixel clock arithmetic does not match (${expected} vs ${profile.pixelClockHz})`);
      }
    }
  }
  const qualified = Boolean(
    target.fpga?.fullOrderingCode &&
      target.fpga?.package &&
      target.fpga?.speedGrade &&
      target.fpga?.pins &&
      target.mcu?.pins &&
      errors.length === 0,
  );
  return {
    ok: errors.length === 0,
    qualified,
    status: qualified ? QUALIFICATION.QUALIFIED : errors.length ? QUALIFICATION.INCOMPLETE : QUALIFICATION.REFERENCE_PROFILE,
    errors,
    warnings,
  };
}

/* ------------------------------------------------------------------------- *
 * Video timing
 * ------------------------------------------------------------------------- */

export function pixelClockFor(profile) {
  return profile.hTotal * profile.vTotal * profile.refreshRate;
}

export function validateVideoProfile(profile) {
  const errors = [];
  if (profile.hActive + profile.hFrontPorch + profile.hSync + profile.hBackPorch !== profile.hTotal) {
    errors.push('Horizontal blanking does not add up to hTotal');
  }
  if (profile.vActive + profile.vFrontPorch + profile.vSync + profile.vBackPorch !== profile.vTotal) {
    errors.push('Vertical blanking does not add up to vTotal');
  }
  const clock = pixelClockFor(profile);
  if (clock !== profile.pixelClockHz) errors.push(`Pixel clock ${profile.pixelClockHz} does not equal hTotal*vTotal*refresh`);
  if (profile.pixelClockHz > DEVICE_SPECS.hdmi.maxInputClockHz) errors.push('Pixel clock exceeds ADV7513 input limit');
  return { ok: errors.length === 0, errors, computedPixelClockHz: clock };
}

export function frameTiming(profile) {
  return {
    hTotal: profile.hTotal,
    vTotal: profile.vTotal,
    activePixels: profile.hActive * profile.vActive,
    totalPixels: profile.hTotal * profile.vTotal,
    blankingPixels: profile.hTotal * profile.vTotal - profile.hActive * profile.vActive,
    framePeriodSeconds: profile.vTotal * profile.hTotal / profile.pixelClockHz,
    linePeriodSeconds: profile.hTotal / profile.pixelClockHz,
    refreshRate: profile.pixelClockHz / (profile.hTotal * profile.vTotal),
    pixelClockHz: profile.pixelClockHz,
  };
}

/* ------------------------------------------------------------------------- *
 * Bandwidth
 * ------------------------------------------------------------------------- */

export function bandwidthReport(profile = VIDEO_PROFILES['1080p30'], ram = DEVICE_SPECS.ram, rom = DEVICE_SPECS.rom) {
  const activePixelsPerSecond = profile.hActive * profile.vActive * profile.refreshRate;
  const rgb888 = activePixelsPerSecond * 3;
  const rgb565 = activePixelsPerSecond * 2;
  const sdramPeak = ram.speedGradeMHz * 1e6 * (ram.busWidth / 8);
  const refreshOverheadPercent = 8;
  const commandOverheadPercent = 22;
  const bankTurnaroundPercent = 10;
  const sdramEstimatedSustained = sdramPeak * (1 - (refreshOverheadPercent + commandOverheadPercent + bankTurnaroundPercent) / 100);
  const romBytesPerSecond = (rom.clockMaxQspiReadHz / 8) * 4; // theoretical quad rate
  const romQuoted = rom.quotedQuadReadBytesPerSecond;
  return {
    activePixelsPerSecond,
    rgb888BytesPerSecond: rgb888,
    rgb565BytesPerSecond: rgb565,
    rgb888MBps: rgb888 / 1e6,
    rgb565MBps: rgb565 / 1e6,
    sdramPeakBytesPerSecond: sdramPeak,
    sdramPeakMBps: sdramPeak / 1e6,
    sdramEstimatedSustainedBytesPerSecond: sdramEstimatedSustained,
    sdramEstimatedSustainedMBps: sdramEstimatedSustained / 1e6,
    sdramMarginOverRgb565BytesPerSecond: sdramEstimatedSustained - rgb565,
    romTheoreticalQuadBytesPerSecond: romBytesPerSecond,
    romQuotedBytesPerSecond: romQuoted,
    romQuotedMBps: romQuoted / 1e6,
    romCoversFullFrameRgb565: romQuoted >= rgb565,
    overheadAssumptions: {
      refreshOverheadPercent,
      commandOverheadPercent,
      bankTurnaroundPercent,
      source: 'reference-profile',
    },
    note:
      'Theoretical SDRAM peak is not sustained usable bandwidth. Measured values must come from the SDRAM model testbench. QSPI quad-read throughput is below full-frame RGB565 scanout, so assets must be prefetched/cached.',
  };
}

/* ------------------------------------------------------------------------- *
 * FPGA resource estimate
 * ------------------------------------------------------------------------- */

/**
 * Conservative pre-synthesis estimate. Yosys gate counts are NOT Gowin LUT
 * utilisation; this estimator only checks whether a proposed block budget is
 * plausible before synthesis.
 */
export function estimateResources(budget) {
  const soc = DEVICE_SPECS.fpga;
  const lineBufferBytes = budget.lineBufferWidth * budget.lineBufferCount * (budget.lineBufferBitsPerPixel / 8);
  const cacheBytes = budget.rowCacheBytes || 0;
  const fifoBytes = budget.fifoBytes || 0;
  const glyphCacheBytes = budget.glyphCacheBytes || 0;
  const totalBramBytes = lineBufferBytes + cacheBytes + fifoBytes + glyphCacheBytes;
  const bramUtilization = (totalBramBytes / soc.blockSramBytes) * 100;
  const lutEstimate =
    (budget.baseLuts || 900) +
    (budget.objects || 16) * (budget.lutsPerObject || 35) +
    (budget.renderers || 4) * (budget.lutsPerRenderer || 180) +
    (budget.controllers || 3) * (budget.lutsPerController || 220);
  const multiplierEstimate = budget.multipliers || 0;
  return {
    device: soc.device,
    lut4Capacity: soc.lut4,
    estimatedLut4: lutEstimate,
    estimatedLutPercent: Math.round((lutEstimate / soc.lut4) * 1000) / 10,
    bramCapacityBytes: soc.blockSramBytes,
    bramBytes: totalBramBytes,
    bramPercent: Math.round(bramUtilization * 10) / 10,
    bramBreakdown: { lineBufferBytes, cacheBytes, fifoBytes, glyphCacheBytes },
    multiplierCapacity: soc.multipliers18x18,
    multipliers: multiplierEstimate,
    pllCapacity: soc.plls,
    plls: budget.plls || 1,
    fit: lutEstimate <= soc.lut4 && totalBramBytes <= soc.blockSramBytes && multiplierEstimate <= soc.multipliers18x18,
    source: 'reference-profile estimate — replace with vendor place-and-route results',
  };
}

/* ------------------------------------------------------------------------- *
 * ROM / RAM budgets
 * ------------------------------------------------------------------------- */

export function romBudget(manifest, rom = DEVICE_SPECS.rom) {
  const used = manifest?.usedBytes ?? 0;
  return {
    capacityBytes: rom.capacityBytes,
    usedBytes: used,
    freeBytes: rom.capacityBytes - used,
    occupancyPercent: Math.round((used / rom.capacityBytes) * 10000) / 100,
    pageBytes: rom.pageBytes,
    sectorBytes: rom.sectorBytes,
    pagesUsed: Math.ceil(used / rom.pageBytes),
    sectorsUsed: Math.ceil(used / rom.sectorBytes),
    readBandwidthMBps: rom.quotedQuadReadBytesPerSecond / 1e6,
    sectorEraseCount: Math.ceil(used / rom.sectorBytes),
    pageProgramCount: Math.ceil(used / rom.pageBytes),
    source: 'datasheet + generated manifest',
  };
}

export function ramBudget(ram = DEVICE_SPECS.ram) {
  const framebufferRgb888 = 1920 * 1080 * 3;
  const framebufferRgb565 = 1920 * 1080 * 2;
  return {
    capacityBytes: ram.capacityBytes,
    busWidth: ram.busWidth,
    clockMHz: ram.speedGradeMHz,
    banks: ram.banks,
    theoreticalPeakMBps: (ram.speedGradeMHz * 1e6 * (ram.busWidth / 8)) / 1e6,
    rgb888FrameBytes: framebufferRgb888,
    rgb565FrameBytes: framebufferRgb565,
    rgb888Frames: Math.floor(ram.capacityBytes / framebufferRgb888),
    rgb565Frames: Math.floor(ram.capacityBytes / framebufferRgb565),
    note:
      'One RGB888 1080p frame fits in 8 MiB; two RGB565 frames consume 8,294,400 bytes and leave almost no working memory.',
    source: 'datasheet + arithmetic',
  };
}

export function buildFeasibilityReport({ target = REFERENCE_TARGET, manifest = null, measurements = null } = {}) {
  const validation = validateTarget(target);
  const profile = VIDEO_PROFILES[target.video?.profile || '1080p30'];
  const timing = validateVideoProfile(profile);
  const bandwidth = bandwidthReport(profile);
  const resources = estimateResources({
    lineBufferWidth: profile.hActive,
    lineBufferCount: 2,
    lineBufferBitsPerPixel: 24,
    rowCacheBytes: 512,
    fifoBytes: 512,
    glyphCacheBytes: 256,
    objects: 16,
    renderers: 4,
    controllers: 3,
    baseLuts: 900,
    lutsPerObject: 35,
    lutsPerRenderer: 180,
    lutsPerController: 220,
    plls: 1,
  });
  const rom = romBudget(manifest || { usedBytes: 0 });
  const ram = ramBudget();
  const checks = [
    {
      id: 'video-timing',
      category: 'HDMI',
      status: timing.ok ? 'PASS' : 'FAIL',
      detail: timing.ok ? `${profile.hTotal}x${profile.vTotal} timing arithmetic verified` : timing.errors.join('; '),
      source: 'arithmetic',
    },
    {
      id: 'hdmi-clock',
      category: 'HDMI',
      status: profile.pixelClockHz <= DEVICE_SPECS.hdmi.maxInputClockHz ? 'PASS' : 'FAIL',
      detail: `${(profile.pixelClockHz / 1e6).toFixed(2)} MHz <= 165 MHz ADV7513 input limit`,
      source: 'datasheet',
    },
    {
      id: 'rom-throughput',
      category: 'ROM',
      status: bandwidth.romCoversFullFrameRgb565 ? 'PASS' : 'WARNING',
      detail: bandwidth.romCoversFullFrameRgb565
        ? 'Quoted quad-read throughput covers full-frame RGB565 scanout'
        : 'QSPI quoted throughput is below full-frame RGB565 scanout; prefetch/cache is required',
      source: 'datasheet + arithmetic',
    },
    {
      id: 'sdram-bandwidth',
      category: 'RAM',
      status: bandwidth.sdramMarginOverRgb565BytesPerSecond > 0 ? 'WARNING' : 'FAIL',
      detail: `Estimated sustained ${bandwidth.sdramEstimatedSustainedMBps.toFixed(1)} MB/s vs RGB565 ${bandwidth.rgb565MBps.toFixed(1)} MB/s — estimate, not measured`,
      source: 'reference-profile',
    },
    {
      id: 'bram-budget',
      category: 'FPGA',
      status: resources.fit ? 'WARNING' : 'FAIL',
      detail: `${resources.bramBytes} / ${resources.bramCapacityBytes} bytes pre-synthesis estimate`,
      source: 'reference-profile',
    },
    {
      id: 'device-qualification',
      category: 'System',
      status: validation.qualified ? 'PASS' : 'WARNING',
      detail: validation.status,
      source: 'configuration',
    },
    {
      id: 'vendor-bitstream',
      category: 'FPGA',
      status: measurements?.vendorBitstream ? 'PASS' : 'WARNING',
      detail: measurements?.vendorBitstream
        ? measurements.vendorBitstream
        : 'Gowin EDA not run — vendor bitstream not generated',
      source: 'toolchain',
    },
    {
      id: 'rtl-simulation',
      category: 'Verification',
      status: measurements?.rtlSimulation === 'PASS' ? 'PASS' : 'WARNING',
      detail: measurements?.rtlSimulation || 'No native HDL simulation result in this report',
      source: 'toolchain',
    },
  ];
  const pass = checks.filter((check) => check.status === 'PASS').length;
  const warning = checks.filter((check) => check.status === 'WARNING').length;
  const fail = checks.filter((check) => check.status === 'FAIL').length;
  return {
    target: target.targetName,
    qualification: validation.status,
    generatedBy: 'EVE shared hardware specification',
    video: { profile, timing, bandwidth },
    fpga: resources,
    rom,
    ram,
    checks,
    summary: { pass, warning, fail },
  };
}

export const SOURCE_LEGEND = Object.freeze({
  datasheet: 'Quoted from a manufacturer datasheet',
  'reference-profile': 'Engineering assumption for the reference prototype',
  'simulation-parameter': 'Parameter used by the RTL and simulator models',
  measured: 'Produced by the local toolchain during a run',
  arithmetic: 'Derived by calculation from the values above',
  configuration: 'Derived from the selected target configuration',
  toolchain: 'Depends on an installed native tool',
});
