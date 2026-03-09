// ============================================================
//  Sistema de Calificación de Clientes — v2.0
//  Stack: TypeScript + Node.js + SQLite (better-sqlite3)
//
//  Cambios respecto a v1:
//  - V1: cálculo porcentual relativo al plazo pactado por cliente
//  - V5: escala adaptada a 3 familias (Lubricantes, Limpiadores, Accesorios)
//  - V6 (precio) y V8 (potencial) eliminadas
//  - Pesos redistribuidos proporcionalmente entre las 6 variables restantes
// ============================================================

// ------------------------------------------------------------
// 1. TIPOS
// ------------------------------------------------------------

export interface CustomerScoringInput {
  customerId: string;

  // V1 — Comportamiento de pago
  // Promedio de días efectivos de cobro en los últimos 12 meses
  avgActualPaymentDays: number;
  // Plazo de pago pactado con este cliente (ej: 30, 60, 90)
  agreedPaymentDays: number;

  // V2 — Volumen de facturación
  // Percentil del cliente dentro de la cartera (0–100)
  billingPercentile: number;

  // V3 — Riesgo de concentración de stock
  // Cantidad de familias distintas consumidas en el año (máx 3)
  uniqueProductFamilies: number;
  // true si alguno de sus productos no tiene otro cliente que lo consuma
  hasMonopolyProduct: boolean;

  // V4 — Frecuencia de contacto / actividad
  // Días transcurridos desde el último pedido registrado
  daysSinceLastOrder: number;

  // V5 — Diversidad de familias de producto
  // Cuántas de las 3 familias consume activamente (Lubricantes, Limpiadores, Accesorios)
  productFamilyCount: 1 | 2 | 3;

  // V6 — Antigüedad
  // Años como cliente activo
  yearsAsCustomer: number;
}

export type CustomerCategory = "A" | "B" | "C" | "D" | "E";

export interface CustomerScoringResult {
  customerId: string;
  score: number;                  // 1.0 – 10.0 redondeado a 2 decimales
  category: CustomerCategory;
  categoryLabel: string;
  categoryDescription: string;
  recommendedAction: string;
  breakdown: Record<string, { raw: number; weighted: number; weight: number }>;
  alerts: string[];
}

// ------------------------------------------------------------
// 2. FUNCIONES DE PUNTUACIÓN POR VARIABLE
// ------------------------------------------------------------

/**
 * V1 — Comportamiento de pago
 * Calcula la demora como % sobre el plazo pactado del cliente.
 * Ej: cliente a 30d que paga a 45d → (45-30)/30 = 50% → score 5
 *     cliente a 60d que paga a 90d → (90-60)/60 = 50% → score 5 (idéntico)
 */
function scoreV1_paymentBehavior(
  avgActualDays: number,
  agreedDays: number
): number {
  if (agreedDays <= 0) return 1;
  const delayPct = ((avgActualDays - agreedDays) / agreedDays) * 100;

  if (delayPct <= 0) return 10; // paga en término o antes
  if (delayPct <= 25) return 7;  // hasta 25% sobre el plazo
  if (delayPct <= 50) return 5;  // hasta 50% sobre el plazo
  if (delayPct <= 100) return 3;  // hasta 100% sobre el plazo
  return 1;                        // más del doble del plazo pactado
}

/**
 * V2 — Volumen de facturación
 */
function scoreV2_billingVolume(percentile: number): number {
  if (percentile >= 90) return 10;
  if (percentile >= 75) return 7;
  if (percentile >= 50) return 5;
  if (percentile >= 10) return 3;
  return 1;
}

/**
 * V3 — Riesgo de concentración de stock
 */
function scoreV3_stockConcentration(
  uniqueFamilies: number,
  hasMonopolyProduct: boolean
): number {
  if (uniqueFamilies >= 3 && !hasMonopolyProduct) return 10;
  if (uniqueFamilies >= 3 && hasMonopolyProduct) return 7;
  if (uniqueFamilies === 2) return 5;
  if (uniqueFamilies === 1 && !hasMonopolyProduct) return 3;
  return 1; // 1 familia con producto exclusivo
}

/**
 * V4 — Frecuencia de contacto / actividad
 */
function scoreV4_contactFrequency(daysSinceLastOrder: number): number {
  if (daysSinceLastOrder <= 7) return 10;
  if (daysSinceLastOrder <= 15) return 7;
  if (daysSinceLastOrder <= 30) return 5;
  if (daysSinceLastOrder <= 90) return 3;
  return 1;
}

/**
 * V5 — Diversidad de familias de producto
 * 3 niveles: consume 1, 2 o las 3 familias disponibles.
 */
function scoreV5_productDiversity(familyCount: 1 | 2 | 3): number {
  if (familyCount >= 3) return 10;
  if (familyCount === 2) return 5;
  return 1;
}

/**
 * V6 — Antigüedad y estabilidad
 */
function scoreV6_seniority(years: number): number {
  if (years >= 5) return 10;
  if (years >= 3) return 7;
  if (years >= 2) return 5;
  if (years >= 1) return 3;
  return 1;
}

// ------------------------------------------------------------
// 3. PESOS (redistribuidos proporcionalmente, suman ~100%)
// ------------------------------------------------------------

const WEIGHTS = {
  v1: 0.29, // Comportamiento de pago
  v2: 0.24, // Volumen de facturación
  v3: 0.18, // Concentración de stock
  v4: 0.12, // Frecuencia de contacto
  v5: 0.12, // Diversidad de familias
  v6: 0.06, // Antigüedad
} as const;

// ------------------------------------------------------------
// 4. FUNCIÓN PRINCIPAL
// ------------------------------------------------------------

export function calculateCustomerScore(
  input: CustomerScoringInput
): CustomerScoringResult {

  const v1 = scoreV1_paymentBehavior(input.avgActualPaymentDays, input.agreedPaymentDays);
  const v2 = scoreV2_billingVolume(input.billingPercentile);
  const v3 = scoreV3_stockConcentration(input.uniqueProductFamilies, input.hasMonopolyProduct);
  const v4 = scoreV4_contactFrequency(input.daysSinceLastOrder);
  const v5 = scoreV5_productDiversity(input.productFamilyCount);
  const v6 = scoreV6_seniority(input.yearsAsCustomer);

  const score = parseFloat((
    v1 * WEIGHTS.v1 +
    v2 * WEIGHTS.v2 +
    v3 * WEIGHTS.v3 +
    v4 * WEIGHTS.v4 +
    v5 * WEIGHTS.v5 +
    v6 * WEIGHTS.v6
  ).toFixed(2));

  const { category, categoryLabel, categoryDescription, recommendedAction } = getCategory(score);
  const alerts = generateAlerts(input, v1, v3, v4);

  return {
    customerId: input.customerId,
    score,
    category,
    categoryLabel,
    categoryDescription,
    recommendedAction,
    breakdown: {
      "V1 Comportamiento de pago": { raw: v1, weighted: parseFloat((v1 * WEIGHTS.v1).toFixed(2)), weight: WEIGHTS.v1 },
      "V2 Volumen de facturación": { raw: v2, weighted: parseFloat((v2 * WEIGHTS.v2).toFixed(2)), weight: WEIGHTS.v2 },
      "V3 Concentración de stock": { raw: v3, weighted: parseFloat((v3 * WEIGHTS.v3).toFixed(2)), weight: WEIGHTS.v3 },
      "V4 Frecuencia de contacto": { raw: v4, weighted: parseFloat((v4 * WEIGHTS.v4).toFixed(2)), weight: WEIGHTS.v4 },
      "V5 Diversidad de familias": { raw: v5, weighted: parseFloat((v5 * WEIGHTS.v5).toFixed(2)), weight: WEIGHTS.v5 },
      "V6 Antigüedad": { raw: v6, weighted: parseFloat((v6 * WEIGHTS.v6).toFixed(2)), weight: WEIGHTS.v6 },
    },
    alerts,
  };
}

// ------------------------------------------------------------
// 5. CATEGORÍAS
// ------------------------------------------------------------

function getCategory(score: number): {
  category: CustomerCategory;
  categoryLabel: string;
  categoryDescription: string;
  recommendedAction: string;
} {
  if (score >= 8.0) return {
    category: "A",
    categoryLabel: "A — Estratégico",
    categoryDescription: "Paga en término, volumen alto, consume todas las familias, activo.",
    recommendedAction: "Fidelizar. Prioridad en stock. Mejores condiciones comerciales.",
  };
  if (score >= 6.0) return {
    category: "B",
    categoryLabel: "B — Estable",
    categoryDescription: "Buen cliente con alguna debilidad menor.",
    recommendedAction: "Mantener. Revisar punto débil anualmente.",
  };
  if (score >= 4.0) return {
    category: "C",
    categoryLabel: "C — A trabajar",
    categoryDescription: "Problemas identificados, aún rentable.",
    recommendedAction: "Renegociar condiciones. Definir plan de mejora con plazo.",
  };
  if (score >= 2.0) return {
    category: "D",
    categoryLabel: "D — En riesgo",
    categoryDescription: "Pagador tardío o muy concentrado en stock.",
    recommendedAction: "Reducir exposición. Endurecer crédito. Evaluar salida.",
  };
  return {
    category: "E",
    categoryLabel: "E — Problemático",
    categoryDescription: "Relación comercial insostenible o con pérdida neta potencial.",
    recommendedAction: "Considerar cierre de la relación comercial.",
  };
}

// ------------------------------------------------------------
// 6. ALERTAS AUTOMÁTICAS
// ------------------------------------------------------------

function generateAlerts(
  input: CustomerScoringInput,
  v1Score: number,
  v3Score: number,
  v4Score: number
): string[] {
  const alerts: string[] = [];

  if (v1Score === 1) {
    const delayPct = Math.round(
      ((input.avgActualPaymentDays - input.agreedPaymentDays) / input.agreedPaymentDays) * 100
    );
    alerts.push(`🔴 CRÉDITO: Demora promedio del ${delayPct}% sobre el plazo pactado. Bloquear nuevo crédito hasta regularización.`);
  } else if (v1Score === 3) {
    alerts.push("🟠 COBRANZA: Demora entre 51% y 100% sobre el plazo. Iniciar gestión de cobro activa.");
  }

  if (input.hasMonopolyProduct) {
    alerts.push("🟠 STOCK: Cliente único consumidor de uno o más productos. Riesgo de inmovilización de stock.");
  }

  if (v4Score === 1) {
    alerts.push("🟡 CHURN: Sin pedidos en más de 90 días. Contacto comercial urgente.");
  }

  return alerts;
}

// ------------------------------------------------------------
// 7. HELPER — % de demora para mostrar en UI
// ------------------------------------------------------------

export function calculatePaymentDelayPct(
  avgActualDays: number,
  agreedDays: number
): number {
  if (agreedDays <= 0) return 0;
  return parseFloat((((avgActualDays - agreedDays) / agreedDays) * 100).toFixed(1));
}

// ------------------------------------------------------------
// 8. INTEGRACIÓN CON SQLite (better-sqlite3)
// ------------------------------------------------------------

/*
import Database from "better-sqlite3";

export function recalculateAllScores(db: Database.Database): void {
  const customers = db.prepare(`
    SELECT
      c.id                             AS customerId,
      c.agreed_payment_days            AS agreedPaymentDays,
      c.years_as_customer              AS yearsAsCustomer,
      c.has_exclusive_product          AS hasExclusiveProduct,
      COALESCE(p.avg_actual_days, c.agreed_payment_days) AS avgActualPaymentDays,
      COALESCE(b.percentile, 1)        AS billingPercentile,
      COALESCE(s.unique_families, 1)   AS uniqueProductFamilies,
      COALESCE(s.unique_families, 1)   AS productFamilyCount,
      COALESCE(o.days_since_last, 999) AS daysSinceLastOrder
    FROM customers c
    LEFT JOIN (
      -- Promedio de días reales desde emisión hasta cobro, últimos 12 meses
      SELECT customer_id,
             AVG(JULIANDAY(paid_date) - JULIANDAY(issue_date)) AS avg_actual_days
      FROM invoices
      WHERE paid_date IS NOT NULL
        AND issue_date >= DATE('now', '-12 months')
      GROUP BY customer_id
    ) p ON p.customer_id = c.id
    LEFT JOIN (
      -- Percentil de facturación anual
      SELECT customer_id,
             CAST(PERCENT_RANK() OVER (ORDER BY SUM(amount)) * 100 AS INTEGER) AS percentile
      FROM invoices
      WHERE created_at >= DATE('now', '-12 months')
      GROUP BY customer_id
    ) b ON b.customer_id = c.id
    LEFT JOIN (
      -- Familias distintas en últimos 12 meses
      SELECT oi.customer_id,
             COUNT(DISTINCT p.family) AS unique_families
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= DATE('now', '-12 months')
      GROUP BY oi.customer_id
    ) s ON s.customer_id = c.id
    LEFT JOIN (
      -- Días desde el último pedido
      SELECT customer_id,
             CAST(JULIANDAY('now') - JULIANDAY(MAX(created_at)) AS INTEGER) AS days_since_last
      FROM orders
      GROUP BY customer_id
    ) o ON o.customer_id = c.id
  `).all() as CustomerScoringInput[];

  const upsert = db.prepare(`
    INSERT INTO customer_scores (customer_id, score, category, alerts, updated_at)
    VALUES (@customerId, @score, @category, @alerts, datetime('now'))
    ON CONFLICT(customer_id) DO UPDATE SET
      score      = excluded.score,
      category   = excluded.category,
      alerts     = excluded.alerts,
      updated_at = excluded.updated_at
  `);

  const runAll = db.transaction((rows: CustomerScoringInput[]) => {
    for (const row of rows) {
      const result = calculateCustomerScore(row);
      upsert.run({
        customerId: result.customerId,
        score:      result.score,
        category:   result.category,
        alerts:     JSON.stringify(result.alerts),
      });
    }
  });

  runAll(customers);
}

// DDL sugerido:
// CREATE TABLE IF NOT EXISTS customer_scores (
//   customer_id  TEXT PRIMARY KEY,
//   score        REAL    NOT NULL,
//   category     TEXT    NOT NULL,   -- 'A' | 'B' | 'C' | 'D' | 'E'
//   alerts       TEXT,               -- JSON array de strings
//   updated_at   TEXT    NOT NULL
// );
//
// Campo requerido en tabla customers:
//   agreed_payment_days  INTEGER NOT NULL DEFAULT 60
*/

// ------------------------------------------------------------
// 9. EJEMPLO DE USO
// ------------------------------------------------------------

/*
const result = calculateCustomerScore({
  customerId:            "CLI-042",
  avgActualPaymentDays:  45,    // paga a 45 días en promedio
  agreedPaymentDays:     30,    // plazo pactado → 50% demora → V1 = 5
  billingPercentile:     78,    // top 25% → V2 = 7
  uniqueProductFamilies: 3,
  hasMonopolyProduct:    true,  // 3 familias con exclusividad → V3 = 7
  daysSinceLastOrder:    12,    // quincenal → V4 = 7
  productFamilyCount:    3,     // → V5 = 10
  yearsAsCustomer:       6,     // → V6 = 10
});

console.log(result);
// score: 6.95 → Categoría B — Estable

const pct = calculatePaymentDelayPct(45, 30); // → 50.0 (para mostrar en UI)
*/

export function getClientScoring(clientId: number | string, db: any): CustomerScoringResult {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client) throw new Error("Client not found");

  // V1 - Comportamiento de pago
  const p = parseInt(client.plazo_de_pago);
  const agreedDays = !isNaN(p) && p > 0 ? p : 30;

  const d = parseInt(client.demora_de_pago);
  const delayDays = !isNaN(d) ? d : 0;
  const avgActualPaymentDays = agreedDays + delayDays;

  // V2 - Volumen de facturación
  const clientInvoices = db.prepare('SELECT SUM(amount) as total FROM invoices WHERE client_id = ? AND issue_date >= DATE("now", "-12 months")').get(clientId);
  const totalAmount = clientInvoices?.total || 0;

  const allInvoices = db.prepare('SELECT client_id, SUM(amount) as sum_amount FROM invoices WHERE issue_date >= DATE("now", "-12 months") GROUP BY client_id').all();
  let percentile = 1;
  if (allInvoices.length > 0 && totalAmount > 0) {
    let lowerCount = 0;
    for (const row of allInvoices) {
      if ((row as any).sum_amount < totalAmount) lowerCount++;
    }
    percentile = (lowerCount / allInvoices.length) * 100;
  }

  // V3 & V5 - Familias y diversificación
  const clientOrders = db.prepare('SELECT id, products FROM client_orders WHERE client_id = ? AND order_date >= DATE("now", "-12 months")').all(clientId);
  let categories = new Set<string>();
  let clientProductCodes = new Set<string>();

  for (const o of clientOrders) {
    try {
      const prods = JSON.parse((o as any).products || "[]");
      for (const p of prods) {
        if (p.code) clientProductCodes.add(p.code);
        const pDb = db.prepare('SELECT category FROM products WHERE code = ? OR name = ?').get(p.code || "", p.name || "");
        if (pDb && (pDb as any).category) categories.add((pDb as any).category);
      }
    } catch (e) { }
  }

  const uniqueProductFamilies = categories.size > 0 ? categories.size : 1;
  const categoryCount = Math.min(Math.max(categories.size, 1), 3) as 1 | 2 | 3;

  let hasMonopolyProduct = false;
  if (clientProductCodes.size > 0) {
    const allOrders12m = db.prepare('SELECT client_id, products FROM client_orders WHERE order_date >= DATE("now", "-12 months")').all();
    for (const code of clientProductCodes) {
      let totalProductOrders = 0;
      let clientProductOrders = 0;
      for (const order of allOrders12m) {
        try {
          const prods = JSON.parse((order as any).products || "[]");
          if (prods.some((p: any) => p.code === code)) {
            totalProductOrders++;
            if (String((order as any).client_id) === String(clientId)) {
              clientProductOrders++;
            }
          }
        } catch (e) { }
      }
      if (totalProductOrders > 0 && (clientProductOrders / totalProductOrders) >= 0.8) {
        hasMonopolyProduct = true;
        break;
      }
    }
  }

  // V4 - Frecuencia de contacto
  const lastOrder = db.prepare('SELECT order_date FROM client_orders WHERE client_id = ? ORDER BY order_date DESC LIMIT 1').get(clientId);
  let daysSinceLastOrder = 999;
  if (lastOrder && (lastOrder as any).order_date) {
    daysSinceLastOrder = Math.floor((new Date().getTime() - new Date((lastOrder as any).order_date).getTime()) / (1000 * 3600 * 24));
  } else {
    // Check if there are interactions
    const lastInteraction = db.prepare('SELECT date FROM interactions WHERE client_id = ? ORDER BY date DESC LIMIT 1').get(clientId);
    if (lastInteraction && (lastInteraction as any).date) {
      daysSinceLastOrder = Math.floor((new Date().getTime() - new Date((lastInteraction as any).date).getTime()) / (1000 * 3600 * 24));
    }
  }

  // V6 - Antigüedad
  let yearsAsCustomer = 0;
  if (client.fecha_primer_pedido) {
    yearsAsCustomer = Math.max(0, (new Date().getTime() - new Date(client.fecha_primer_pedido).getTime()) / (1000 * 3600 * 24 * 365.25));
  }

  const input: CustomerScoringInput = {
    customerId: String(clientId),
    avgActualPaymentDays,
    agreedPaymentDays: agreedDays,
    billingPercentile: percentile,
    uniqueProductFamilies,
    hasMonopolyProduct,
    daysSinceLastOrder,
    productFamilyCount: categoryCount,
    yearsAsCustomer
  };

  return calculateCustomerScore(input);
}
