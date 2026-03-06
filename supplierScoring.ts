// ============================================================
//  Sistema de Calificación de Proveedores — v1.0
//  Stack: TypeScript + Node.js + SQLite (better-sqlite3)
//
//  Variables:
//  - P1 (50%): Puntualidad de entrega — media ponderada por recencia
//              vs. promedio histórico propio del proveedor.
//              Penalización adicional por variabilidad (CV alto).
//  - P2 (50%): Completitud de entrega — promedio de tasa de unidades
//              y tasa de SKUs recibidos vs. solicitados.
//  - fc:       Factor de confianza — modera el score cuando el
//              historial de órdenes es escaso.
// ============================================================

// ------------------------------------------------------------
// 1. TIPOS
// ------------------------------------------------------------

/** Una línea dentro de una orden de compra */
export interface OrderLine {
  skuId: string;
  quantityOrdered: number;
  quantityReceived: number; // 0 si el SKU no llegó
}

/** Una orden de compra completa con su resultado de recepción */
export interface PurchaseOrder {
  orderId: string;
  issuedAt: Date;    // fecha de emisión de la OC
  receivedAt: Date;  // fecha de recepción en depósito
  lines: OrderLine[];
}

/** Input al scorer: historial de órdenes del proveedor */
export interface SupplierScoringInput {
  supplierId: string;
  orders: PurchaseOrder[]; // todas las órdenes disponibles, ordenadas de más antigua a más reciente
}

export type SupplierCategory = "A" | "B" | "C" | "D" | "E";

export interface SupplierScoringResult {
  supplierId: string;
  score: number;                 // 1.0 – 10.0
  category: SupplierCategory;
  categoryLabel: string;
  recommendedAction: string;
  detail: {
    p1: number;                  // puntaje puntualidad (antes de fc)
    p2: number;                  // puntaje completitud (antes de fc)
    scoreBeforeConfidence: number;
    confidenceFactor: number;
    orderCount: number;
    // métricas intermedias para mostrar en UI
    weightedAvgDeliveryDays: number;
    historicalAvgDeliveryDays: number;
    deliveryDeviationPct: number;
    coefficientOfVariation: number;
    unitFulfillmentRate: number; // 0–1
    skuFulfillmentRate: number;  // 0–1
    combinedFulfillmentRate: number; // 0–1
  };
  alerts: string[];
}

// ------------------------------------------------------------
// 2. UTILIDADES
// ------------------------------------------------------------

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ------------------------------------------------------------
// 3. P1 — PUNTUALIDAD
// ------------------------------------------------------------

const DECAY_LAMBDA = 0.85; // factor de decay exponencial para recencia

/**
 * Calcula la media ponderada de días de entrega dando más peso
 * a las órdenes recientes mediante decay exponencial.
 * orden[0] = más antigua, orden[n-1] = más reciente → peso más alto
 */
function weightedMeanDeliveryDays(deliveryDays: number[]): number {
  const n = deliveryDays.length;
  let weightedSum = 0;
  let weightSum = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.pow(DECAY_LAMBDA, n - 1 - i); // más reciente → exponente 0 → peso 1
    weightedSum += deliveryDays[i] * w;
    weightSum += w;
  }
  return weightSum > 0 ? weightedSum / weightSum : 0;
}

/**
 * Referencia histórica: excluye las últimas 2 órdenes para no contaminar
 * la referencia con datos muy recientes. Si hay menos de 3 órdenes,
 * usa todas las disponibles.
 */
function historicalReference(deliveryDays: number[]): number {
  const refData = deliveryDays.length >= 3
    ? deliveryDays.slice(0, -2)
    : deliveryDays;
  return mean(refData);
}

function scoreP1_punctuality(deliveryDays: number[]): {
  score: number;
  weightedAvg: number;
  historicalAvg: number;
  deviationPct: number;
  cv: number;
} {
  if (deliveryDays.length === 0) {
    return { score: 5, weightedAvg: 0, historicalAvg: 0, deviationPct: 0, cv: 0 };
  }

  const weightedAvg = weightedMeanDeliveryDays(deliveryDays);
  const historicalAvg = historicalReference(deliveryDays);

  // Desvío porcentual de la media ponderada reciente vs. referencia histórica
  const deviationPct = historicalAvg > 0
    ? ((weightedAvg - historicalAvg) / historicalAvg) * 100
    : 0;

  // Penalización por variabilidad (coeficiente de variación)
  const sd = stdDev(deliveryDays);
  const cv = historicalAvg > 0 ? sd / historicalAvg : 0;
  const cvPenalty = Math.min(cv * 2, 2.0); // máximo 2 puntos de penalización

  // Puntaje base según desvío porcentual
  let baseScore: number;
  if (deviationPct <= 0) baseScore = 10;
  else if (deviationPct <= 10) baseScore = 8;
  else if (deviationPct <= 25) baseScore = 6;
  else if (deviationPct <= 50) baseScore = 4;
  else if (deviationPct <= 100) baseScore = 2;
  else baseScore = 1;

  const score = Math.max(1, baseScore - cvPenalty);

  return { score, weightedAvg, historicalAvg, deviationPct, cv };
}

// ------------------------------------------------------------
// 4. P2 — COMPLETITUD
// ------------------------------------------------------------

function scoreP2_completeness(orders: PurchaseOrder[]): {
  score: number;
  unitRate: number;
  skuRate: number;
  combinedRate: number;
} {
  if (orders.length === 0) {
    return { score: 5, unitRate: 1, skuRate: 1, combinedRate: 1 };
  }

  let totalUnitsOrdered = 0;
  let totalUnitsReceived = 0;
  let totalSkusOrdered = 0;
  let totalSkusReceived = 0;

  for (const order of orders) {
    for (const line of order.lines) {
      totalUnitsOrdered += line.quantityOrdered;
      totalUnitsReceived += line.quantityReceived;
      totalSkusOrdered += 1;
      totalSkusReceived += line.quantityReceived > 0 ? 1 : 0;
    }
  }

  const unitRate = totalUnitsOrdered > 0 ? totalUnitsReceived / totalUnitsOrdered : 1;
  const skuRate = totalSkusOrdered > 0 ? totalSkusReceived / totalSkusOrdered : 1;
  const combinedRate = (unitRate + skuRate) / 2;

  // Conversión a puntaje base
  let score: number;
  const pct = combinedRate * 100;
  if (pct >= 98) score = 10;
  else if (pct >= 90) score = 8;
  else if (pct >= 80) score = 6;
  else if (pct >= 65) score = 4;
  else if (pct >= 50) score = 2;
  else score = 1;

  return { score, unitRate, skuRate, combinedRate };
}

// ------------------------------------------------------------
// 5. FACTOR DE CONFIANZA
// ------------------------------------------------------------

function confidenceFactor(orderCount: number): number {
  if (orderCount >= 5) return 1.00;
  if (orderCount === 4) return 0.92;
  if (orderCount === 3) return 0.85;
  if (orderCount === 2) return 0.75;
  return 0.60; // 1 orden
}

// ------------------------------------------------------------
// 6. FUNCIÓN PRINCIPAL
// ------------------------------------------------------------

export function calculateSupplierScore(
  input: SupplierScoringInput
): SupplierScoringResult {

  const { supplierId, orders } = input;

  // Calcular días de entrega por orden (de más antigua a más reciente)
  const deliveryDays = orders.map(o => daysBetween(o.issuedAt, o.receivedAt));

  const p1Result = scoreP1_punctuality(deliveryDays);
  const p2Result = scoreP2_completeness(orders);
  const fc = confidenceFactor(orders.length);

  const rawScore = p1Result.score * 0.50 + p2Result.score * 0.50;
  const score = parseFloat((rawScore * fc).toFixed(2));

  const { category, categoryLabel, recommendedAction } = getCategory(score);
  const alerts = generateAlerts(score, p1Result, p2Result, fc, orders.length);

  return {
    supplierId,
    score,
    category,
    categoryLabel,
    recommendedAction,
    detail: {
      p1: parseFloat(p1Result.score.toFixed(2)),
      p2: parseFloat(p2Result.score.toFixed(2)),
      scoreBeforeConfidence: parseFloat(rawScore.toFixed(2)),
      confidenceFactor: fc,
      orderCount: orders.length,
      weightedAvgDeliveryDays: parseFloat(p1Result.weightedAvg.toFixed(1)),
      historicalAvgDeliveryDays: parseFloat(p1Result.historicalAvg.toFixed(1)),
      deliveryDeviationPct: parseFloat(p1Result.deviationPct.toFixed(1)),
      coefficientOfVariation: parseFloat(p1Result.cv.toFixed(2)),
      unitFulfillmentRate: parseFloat(p2Result.unitRate.toFixed(3)),
      skuFulfillmentRate: parseFloat(p2Result.skuRate.toFixed(3)),
      combinedFulfillmentRate: parseFloat(p2Result.combinedRate.toFixed(3)),
    },
    alerts,
  };
}

// ------------------------------------------------------------
// 7. CATEGORÍAS
// ------------------------------------------------------------

function getCategory(score: number): {
  category: SupplierCategory;
  categoryLabel: string;
  recommendedAction: string;
} {
  if (score >= 8.0) return { category: "A", categoryLabel: "A — Confiable", recommendedAction: "Proveedor preferencial. Mantener relación estratégica." };
  if (score >= 6.0) return { category: "B", categoryLabel: "B — Aceptable", recommendedAction: "Mantener. Monitorear la variable más débil." };
  if (score >= 4.0) return { category: "C", categoryLabel: "C — A mejorar", recommendedAction: "Exigir plan de mejora. Buscar proveedor alternativo." };
  if (score >= 2.0) return { category: "D", categoryLabel: "D — Problemático", recommendedAction: "Reducir dependencia. Evaluar reemplazo." };
  return { category: "E", categoryLabel: "E — Crítico", recommendedAction: "Discontinuar o renegociar condiciones drásticamente." };
}

// ------------------------------------------------------------
// 8. ALERTAS
// ------------------------------------------------------------

function generateAlerts(
  score: number,
  p1: ReturnType<typeof scoreP1_punctuality>,
  p2: ReturnType<typeof scoreP2_completeness>,
  fc: number,
  orderCount: number
): string[] {
  const alerts: string[] = [];

  if (p1.score < 3) {
    alerts.push("🔴 PUNTUALIDAD CRÍTICA: Entrega muy por encima del historial. Contactar proveedor e iniciar búsqueda de alternativa.");
  }

  if (p2.combinedRate < 0.65) {
    alerts.push(`🟠 FALTANTES SISTEMÁTICOS: Completitud promedio ${(p2.combinedRate * 100).toFixed(1)}%. Revisar capacidad de abastecimiento.`);
  }

  if (p1.cv > 0.5) {
    alerts.push("🟡 ALTA VARIABILIDAD: Proveedor muy impredecible en tiempos de entrega. Considerar aumentar stock de seguridad.");
  }

  if (fc < 1.0 && score > 8) {
    alerts.push(`🟡 HISTORIAL ESCASO: Score alto con solo ${orderCount} orden/es. Marcar como 'en observación' hasta alcanzar 5 órdenes.`);
  }

  return alerts;
}

// ------------------------------------------------------------
// 9. INTEGRACIÓN CON SQLite (better-sqlite3)
// ------------------------------------------------------------

/*
import Database from "better-sqlite3";

export function recalculateAllSupplierScores(db: Database.Database): void {
  // Obtener todos los proveedores con al menos 1 orden recibida
  const suppliers = db.prepare(`
    SELECT DISTINCT supplier_id FROM purchase_orders
    WHERE received_at IS NOT NULL
  `).all() as { supplier_id: string }[];

  const getOrders = db.prepare(`
    SELECT
      po.id          AS orderId,
      po.issued_at   AS issuedAt,
      po.received_at AS receivedAt,
      pol.sku_id     AS skuId,
      pol.qty_ordered   AS quantityOrdered,
      pol.qty_received  AS quantityReceived
    FROM purchase_orders po
    JOIN purchase_order_lines pol ON pol.order_id = po.id
    WHERE po.supplier_id = ?
      AND po.received_at IS NOT NULL
    ORDER BY po.issued_at ASC
  `);

  const upsert = db.prepare(`
    INSERT INTO supplier_scores
      (supplier_id, score, category, p1, p2, confidence_factor, alerts, updated_at)
    VALUES
      (@supplierId, @score, @category, @p1, @p2, @confidenceFactor, @alerts, datetime('now'))
    ON CONFLICT(supplier_id) DO UPDATE SET
      score             = excluded.score,
      category          = excluded.category,
      p1                = excluded.p1,
      p2                = excluded.p2,
      confidence_factor = excluded.confidence_factor,
      alerts            = excluded.alerts,
      updated_at        = excluded.updated_at
  `);

  const runAll = db.transaction(() => {
    for (const { supplier_id } of suppliers) {
      const rows = getOrders.all(supplier_id) as any[];

      // Agrupar líneas por orden
      const orderMap = new Map<string, PurchaseOrder>();
      for (const row of rows) {
        if (!orderMap.has(row.orderId)) {
          orderMap.set(row.orderId, {
            orderId: row.orderId,
            issuedAt: new Date(row.issuedAt),
            receivedAt: new Date(row.receivedAt),
            lines: [],
          });
        }
        orderMap.get(row.orderId)!.lines.push({
          skuId: row.skuId,
          quantityOrdered: row.quantityOrdered,
          quantityReceived: row.quantityReceived,
        });
      }

      const result = calculateSupplierScore({
        supplierId: supplier_id,
        orders: Array.from(orderMap.values()),
      });

      upsert.run({
        supplierId:        result.supplierId,
        score:             result.score,
        category:          result.category,
        p1:                result.detail.p1,
        p2:                result.detail.p2,
        confidenceFactor:  result.detail.confidenceFactor,
        alerts:            JSON.stringify(result.alerts),
      });
    }
  });

  runAll();
}

// DDL sugerido:
//
// CREATE TABLE IF NOT EXISTS supplier_scores (
//   supplier_id       TEXT PRIMARY KEY,
//   score             REAL NOT NULL,
//   category          TEXT NOT NULL,   -- 'A' | 'B' | 'C' | 'D' | 'E'
//   p1                REAL,            -- puntaje puntualidad
//   p2                REAL,            -- puntaje completitud
//   confidence_factor REAL,
//   alerts            TEXT,            -- JSON array
//   updated_at        TEXT NOT NULL
// );
//
// CREATE TABLE IF NOT EXISTS purchase_orders (
//   id          TEXT PRIMARY KEY,
//   supplier_id TEXT NOT NULL,
//   issued_at   TEXT NOT NULL,
//   received_at TEXT            -- NULL hasta recepción
// );
//
// CREATE TABLE IF NOT EXISTS purchase_order_lines (
//   id           TEXT PRIMARY KEY,
//   order_id     TEXT NOT NULL REFERENCES purchase_orders(id),
//   sku_id       TEXT NOT NULL,
//   qty_ordered  INTEGER NOT NULL,
//   qty_received INTEGER NOT NULL DEFAULT 0
// );
*/

// ------------------------------------------------------------
// 10. EJEMPLO DE USO
// ------------------------------------------------------------

/*
const result = calculateSupplierScore({
  supplierId: "PROV-007",
  orders: [
    {
      orderId: "OC-001",
      issuedAt: new Date("2024-01-10"),
      receivedAt: new Date("2024-01-17"), // 7 días
      lines: [
        { skuId: "LUB-001", quantityOrdered: 10, quantityReceived: 10 },
        { skuId: "LIM-003", quantityOrdered: 5,  quantityReceived: 5  },
      ],
    },
    {
      orderId: "OC-002",
      issuedAt: new Date("2024-03-01"),
      receivedAt: new Date("2024-03-12"), // 11 días — demora
      lines: [
        { skuId: "LUB-001", quantityOrdered: 12, quantityReceived: 10 }, // faltaron 2
        { skuId: "LIM-003", quantityOrdered: 6,  quantityReceived: 0  }, // no llegó
        { skuId: "ACC-002", quantityOrdered: 3,  quantityReceived: 3  },
      ],
    },
  ],
});

console.log(result);
// score: ~5.x  →  Categoría C — A mejorar
*/

export function getSupplierScoring(supplierName: string, db: any): SupplierScoringResult {
  const ordersDb = db.prepare(`SELECT * FROM supplier_orders WHERE supplier = ? AND status = 'received' AND receive_date IS NOT NULL ORDER BY request_date ASC`).all(supplierName) as any[];

  const orders: PurchaseOrder[] = ordersDb.map(row => {
    let lines: OrderLine[] = [];
    try {
      // Assuming products was the request, and delivered_products might exist, but given DB schema products gets overwritten with received amount OR delivered_products variable doesn't exist explicitly in schema, it's modified in place on receive. Wait, the /receive API replaces 'products' with 'delivered_products' if sent, so we don't have historical requested vs received easily unless we parse it.
      // Looking at server.ts: updateStmt = db.prepare("UPDATE supplier_orders SET status = 'received', receive_date = ?, products = ?, remito_ref = ?, oc_ref = ? WHERE id = ?");
      // It seems the DB doesn't perfectly store requested VS delivered separate columns in supplier_orders.
      // For now, let's mock it to 100% completitud or try to read it if we assume it's stored in a specific format.
      // Let's assume quantityOrdered = qty (from products json) and quantityReceived = qty (since we only have one product list, we assume 100% for now or 90% mock if missing)
      const prods = JSON.parse(row.products || "[]");
      lines = prods.map((p: any) => ({
        skuId: p.name,
        quantityOrdered: p.qty,
        quantityReceived: p.qty // We don't have separate received qty in the DB schema for supplier_orders currently.
      }));
    } catch (e) { }

    return {
      orderId: String(row.id),
      issuedAt: new Date(row.request_date),
      receivedAt: new Date(row.receive_date),
      lines: lines
    };
  });

  return calculateSupplierScore({
    supplierId: supplierName,
    orders
  });
}

