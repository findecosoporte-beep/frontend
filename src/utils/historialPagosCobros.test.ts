import { describe, expect, it } from 'vitest'

import {
  buildHistorialQueryString,
  compararMontoHistorial,
  enriquecerFilasHistorial,
  filtrarFilasHistorial,
  filtrarFilasPorCobradorSeleccionado,
  normalizarCobradorFiltroId,
  parseMontoHistorial,
  sumarResumenFilas,
  textoCobradorBusqueda,
  validarRangoSemana,
} from './historialPagosCobros'
import type { HistorialPagosCobrosFila } from '@/types/api'

function fila(partial: Partial<HistorialPagosCobrosFila>): HistorialPagosCobrosFila {
  return {
    id_pago: 1,
    fecha_pago: '2026-08-01',
    documento: 'Cuota 1',
    capital: '100.00',
    interes: '10.00',
    total: '110.00',
    id_prestamo: 1,
    numero_prestamo: 'PR-00001',
    nombre_cliente: 'Cliente',
    dni_cliente: '0801',
    cartera_nombre: 'Cartera',
    ...partial,
  }
}

describe('parseMontoHistorial', () => {
  it('parsea strings y números', () => {
    expect(parseMontoHistorial('450.00')).toBe(450)
    expect(parseMontoHistorial('1,200.50')).toBe(1200.5)
    expect(parseMontoHistorial(null)).toBe(0)
  })
})

describe('sumarResumenFilas', () => {
  it('suma capital y total de filas visibles', () => {
    const resumen = sumarResumenFilas([
      fila({ capital: '100.00', total: '110.00' }),
      fila({ capital: '250.50', total: '275.00' }),
    ])
    expect(resumen.registros).toBe(2)
    expect(resumen.totalCapital).toBe(350.5)
    expect(resumen.totalCobrado).toBe(385)
  })
})

describe('compararMontoHistorial', () => {
  it('ordena montos numéricamente', () => {
    const bajo = fila({ capital: '90.00' })
    const alto = fila({ capital: '1000.00' })
    expect(compararMontoHistorial(bajo, alto, 'capital')).toBeLessThan(0)
    expect(compararMontoHistorial(alto, bajo, 'capital')).toBeGreaterThan(0)
  })
})

describe('buildHistorialQueryString', () => {
  it('arma query por semana con cobrador', () => {
    const qs = buildHistorialQueryString({
      modo: 'semana',
      fechaDia: '2026-08-31',
      fechaInicioSemana: '2026-08-25',
      fechaFinSemana: '2026-08-31',
      mes: 8,
      anio: 2026,
      cobradorFiltro: 5,
    })
    expect(qs).toContain('modo=semana')
    expect(qs).toContain('fecha_inicio=2026-08-25')
    expect(qs).toContain('fecha_fin=2026-08-31')
    expect(qs).toContain('registrado_por=5')
  })

  it('normaliza id de cobrador antes de enviarlo', () => {
    const qs = buildHistorialQueryString({
      modo: 'dia',
      fechaDia: '2026-09-06',
      fechaInicioSemana: '2026-09-01',
      fechaFinSemana: '2026-09-07',
      mes: 9,
      anio: 2026,
      cobradorFiltro: '12' as unknown as number,
    })
    expect(qs).toContain('registrado_por=12')
  })
})

describe('filtrarFilasPorCobradorSeleccionado', () => {
  it('filtra por id de cobrador registrado', () => {
    const filas = filtrarFilasPorCobradorSeleccionado(
      [
        fila({ id_pago: 1, registrado_por: 10, registrado_por_nombre: 'Carlos' }),
        fila({ id_pago: 2, registrado_por: 11, registrado_por_nombre: 'Luis' }),
      ],
      10,
      'Carlos',
    )
    expect(filas).toHaveLength(1)
    expect(filas[0]?.id_pago).toBe(1)
  })

  it('filtra por nombre si coincide el cobrador seleccionado', () => {
    const filas = filtrarFilasPorCobradorSeleccionado(
      [
        fila({ id_pago: 3, registrado_por: undefined, registrado_por_nombre: 'Carlos Daniel Hernandez' }),
        fila({ id_pago: 4, registrado_por: 11, registrado_por_nombre: 'Luis Alfredo Benitez Garcia' }),
      ],
      10,
      'Carlos Daniel Hernandez',
    )
    expect(filas).toHaveLength(1)
    expect(filas[0]?.id_pago).toBe(3)
  })
})

describe('validarRangoSemana', () => {
  it('rechaza fin anterior al inicio', () => {
    expect(validarRangoSemana('2026-08-10', '2026-08-01')).toMatch(/anterior/)
  })

  it('acepta rango válido', () => {
    expect(validarRangoSemana('2026-08-01', '2026-08-07')).toBeNull()
  })
})

describe('textoCobradorBusqueda', () => {
  it('combina nombre, etiqueta e id', () => {
    const texto = textoCobradorBusqueda(
      fila({
        registrado_por: 7,
        registrado_por_nombre: 'Juan Pérez',
        registrado_por_etiqueta: 'Juan Pérez (ID 7)',
      }),
    )
    expect(texto).toContain('Juan Pérez')
    expect(texto).toContain('7')
  })
})

describe('filtrarFilasHistorial', () => {
  const camposColumna = ['_texto_cobrador', 'nombre_cliente'] as const
  const camposGlobal = ['_texto_cobrador', 'nombre_cliente', 'id_pago'] as const

  it('filtra por nombre de cobrador sin importar acentos', () => {
    const filas = enriquecerFilasHistorial([
      fila({
        id_pago: 1,
        nombre_cliente: 'Ana',
        registrado_por: 1,
        registrado_por_nombre: 'José Martínez',
        registrado_por_etiqueta: 'José Martínez (ID 1)',
      }),
      fila({
        id_pago: 2,
        nombre_cliente: 'Luis',
        registrado_por: 2,
        registrado_por_nombre: 'María López',
        registrado_por_etiqueta: 'María López (ID 2)',
      }),
    ])

    const filtradas = filtrarFilasHistorial(
      filas,
      {
        global: { value: null, matchMode: 'contains' },
        _texto_cobrador: { value: 'jose', matchMode: 'contains' },
        nombre_cliente: { value: null, matchMode: 'contains' },
      },
      camposColumna,
      camposGlobal,
    )

    expect(filtradas).toHaveLength(1)
    expect(filtradas[0]?.id_pago).toBe(1)
  })

  it('filtra por cobrador en búsqueda global', () => {
    const filas = enriquecerFilasHistorial([
      fila({
        id_pago: 10,
        nombre_cliente: 'Cliente A',
        registrado_por_nombre: 'Pedro Ruiz',
      }),
      fila({
        id_pago: 11,
        nombre_cliente: 'Cliente B',
        registrado_por_nombre: 'Carlos Díaz',
      }),
    ])

    const filtradas = filtrarFilasHistorial(
      filas,
      {
        global: { value: 'pedro', matchMode: 'contains' },
        _texto_cobrador: { value: null, matchMode: 'contains' },
        nombre_cliente: { value: null, matchMode: 'contains' },
      },
      camposColumna,
      camposGlobal,
    )

    expect(filtradas).toHaveLength(1)
    expect(filtradas[0]?.registrado_por_nombre).toBe('Pedro Ruiz')
  })
})
