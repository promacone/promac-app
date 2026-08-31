// Tabela de frete fracionado por faixa de peso.
//
// O motor de rateio (fracionado.js) calcula o preço a partir da ocupação
// do truck e do piso ANTT. É a conta certa, e é como o setor ensina a
// montar a tabela — mas não é como se cota no balcão. Transportadora
// cota lendo uma grade: "300 kg para São Paulo, R$ 1.024".
//
// Esta grade é essa leitura. Ela nasce preenchida pelo motor e o Pedro
// digita por cima de qualquer preço que não combine com o que ele
// pratica. Onde ele digitou, vale o número dele; onde não digitou, vale
// o motor. Assim a régua é dele, não a minha, e a conta continua tendo
// piso de custo por baixo.

/** Faixas de peso, em kg. O preço é o mesmo dentro da faixa. */
export const FAIXAS_PESO = [30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000]

/**
 * Faixas de distância, em km.
 *
 * Separadas porque dentro do Sul/Sudeste cabe desde Curitiba (115 km)
 * até Belo Horizonte (1.090 km) — cobrar parecido pelas duas foi o que
 * deixou a tabela torta.
 */
export const FAIXAS_KM = [
  { ate: 200, titulo: 'até 200 km', referencia: 130 },
  { ate: 400, titulo: '201 a 400 km', referencia: 300 },
  { ate: 700, titulo: '401 a 700 km', referencia: 540 },
  { ate: 1000, titulo: '701 a 1.000 km', referencia: 850 },
  { ate: Infinity, titulo: 'acima de 1.000 km', referencia: 1200 },
]

/** Em que faixa de peso cai um peso faturado. */
export function faixaDePeso(pesoKg) {
  const p = Math.max(0, pesoKg)
  for (const limite of FAIXAS_PESO) {
    if (p <= limite) return limite
  }
  return null // acima da última faixa: cobra por quilo
}

/** Em que coluna de distância cai uma rota. */
export function faixaDeKm(km) {
  const d = Math.max(0, km)
  return FAIXAS_KM.findIndex((f) => d <= f.ate)
}

/**
 * Monta a grade inteira a partir do motor de rateio.
 *
 * Serve para nascer preenchida com valores coerentes — o Pedro corrige
 * o que quiser em vez de digitar 50 números do zero.
 */
export function gradePadrao({ calcularFracionado, calcularFrete, coeficientes, parametros }) {
  const grade = {}

  for (const [coluna, faixaKm] of FAIXAS_KM.entries()) {
    for (const peso of FAIXAS_PESO) {
      const r = calcularFracionado({
        regiaoId: 'sulSudeste',
        distanciaKm: faixaKm.referencia,
        // Densidade típica de carga geral paletizada.
        pesoKg: peso,
        volumeM3: peso / 320,
        valorNFe: 0,
        taxasFixas: 0,
        parametros,
        calcularFreteDedicado: calcularFrete,
        coeficientes,
      })
      grade[`${coluna}:${peso}`] = arredondar(r.fretePeso)
    }

    // Excedente: o preço do quilo acima da última faixa, tirado da
    // inclinação entre 3 t e 5 t — onde a curva já está estável.
    const a = grade[`${coluna}:3000`]
    const b = grade[`${coluna}:5000`]
    grade[`${coluna}:excedente`] = Math.max(0.05, Math.round(((b - a) / 2000) * 100) / 100)
  }

  return grade
}

/** Preço de um peso numa rota, lendo a grade. */
export function precoNaGrade(grade, pesoKg, km) {
  const coluna = faixaDeKm(km)
  if (coluna < 0) return null

  const faixa = faixaDePeso(pesoKg)

  if (faixa !== null) {
    const valor = grade[`${coluna}:${faixa}`]
    return Number.isFinite(valor) ? valor : null
  }

  // Acima da última faixa: o preço dos 5.000 kg mais o excedente por kg.
  const base = grade[`${coluna}:5000`]
  const excedente = grade[`${coluna}:excedente`]
  if (!Number.isFinite(base) || !Number.isFinite(excedente)) return null

  return base + (Math.max(0, pesoKg) - 5000) * excedente
}

/** Arredonda para 10 reais, que é como preço de frete se fala. */
function arredondar(valor) {
  return Math.round(valor / 10) * 10
}
