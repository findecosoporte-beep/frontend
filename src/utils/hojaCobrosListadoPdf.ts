import { jsPDF } from 'jspdf'

import {
  filaListadoHojaCobrosCeldas,
  filaTotalesListadoHojaCobros,
  formatFechaHojaLegible,
  formatDateTime,
} from '@/utils/hojaCobrosListadoDisplay'
import type { ReporteIntegracionFila } from '@/types/api'

const MARGIN = 8
const FONT_BODY = 7
const ROW_H_MIN = 5.5
const CELL_PAD = 1.2

type Align = 'left' | 'center' | 'right'

type TableColumn = { header: string; width: number; align?: Align }

const LISTADO_COLUMNS: TableColumn[] = [
  { header: 'N', width: 8, align: 'center' },
  { header: 'Nº PRÉSTAMO', width: 22, align: 'center' },
  { header: 'NOMBRE CLIENTE', width: 42, align: 'left' },
  { header: 'MONTO', width: 22, align: 'right' },
  { header: 'PLAZO EN MESES', width: 16, align: 'center' },
  { header: 'SALDO INICIAL', width: 22, align: 'right' },
  { header: 'SALDO PENDIENTE', width: 22, align: 'right' },
  { header: 'FECHA INICIAL', width: 20, align: 'center' },
  { header: 'FECHA FINAL', width: 20, align: 'center' },
  { header: 'CUOTA PENDIENTE', width: 24, align: 'center' },
  { header: 'ESPACIO', width: 14, align: 'left' },
]

export type HojaCobrosListadoPdfInput = {
  carteraEtiqueta: string
  fechaReporteIso: string
  generadoEnIso: string
  filas: ReporteIntegracionFila[]
  logoDataUrl?: string | null
}

function lineHeightForFont(fontSize: number): number {
  return fontSize * 0.38 + 1.8
}

function wrapCellLines(doc: jsPDF, text: string, width: number, fontSize: number): string[] {
  doc.setFontSize(fontSize)
  const inner = Math.max(width - CELL_PAD * 2, 4)
  return doc.splitTextToSize(text || ' ', inner) as string[]
}

function measureCellHeight(doc: jsPDF, text: string, width: number, fontSize: number): number {
  const lines = wrapCellLines(doc, text, width, fontSize)
  return Math.max(ROW_H_MIN, lines.length * lineHeightForFont(fontSize) + CELL_PAD * 2)
}

function scaledColumnWidths(doc: jsPDF, columns: TableColumn[]): number[] {
  const pageW = doc.internal.pageSize.getWidth()
  const tableW = pageW - MARGIN * 2
  const totalDefined = columns.reduce((sum, col) => sum + col.width, 0)
  const scale = tableW / totalDefined
  return columns.map((col) => col.width * scale)
}

function drawTextCell(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: Align,
  bold = false,
  fontSize = FONT_BODY,
) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(fontSize)
  const lines = wrapCellLines(doc, text, width, fontSize)
  const lineHeight = lineHeightForFont(fontSize)
  const blockH = lines.length * lineHeight
  let textY = y + (height - blockH) / 2 + lineHeight * 0.82
  if (textY < y + CELL_PAD + lineHeight * 0.5) {
    textY = y + CELL_PAD + lineHeight * 0.82
  }
  for (const line of lines) {
    let textX = x + CELL_PAD
    if (align === 'right') {
      textX = x + width - CELL_PAD - doc.getTextWidth(line)
    } else if (align === 'center') {
      textX = x + (width - doc.getTextWidth(line)) / 2
    }
    doc.text(line, textX, textY)
    textY += lineHeight
  }
}

function drawCenteredText(doc: jsPDF, text: string, y: number, fontSize: number, bold = false): number {
  const pageW = doc.internal.pageSize.getWidth()
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(fontSize)
  const tw = doc.getTextWidth(text)
  doc.text(text, (pageW - tw) / 2, y)
  return y + lineHeightForFont(fontSize) + 0.8
}

function drawTable(
  doc: jsPDF,
  y: number,
  columns: TableColumn[],
  rows: string[][],
  options?: { boldLastRow?: boolean },
): number {
  const boldLastRow = options?.boldLastRow === true
  const widths = scaledColumnWidths(doc, columns)

  function drawHeaderRow(startY: number): number {
    let headerH = ROW_H_MIN
    for (let i = 0; i < columns.length; i += 1) {
      headerH = Math.max(headerH, measureCellHeight(doc, columns[i].header, widths[i], FONT_BODY))
    }
    let x = MARGIN
    for (let i = 0; i < columns.length; i += 1) {
      doc.setFillColor(243, 244, 246)
      doc.rect(x, startY, widths[i], headerH, 'FD')
      drawTextCell(
        doc,
        columns[i].header,
        x,
        startY,
        widths[i],
        headerH,
        columns[i].align ?? 'left',
        true,
        FONT_BODY,
      )
      x += widths[i]
    }
    return startY + headerH
  }

  y = drawHeaderRow(y)

  rows.forEach((row, rowIndex) => {
    const isLast = boldLastRow && rowIndex === rows.length - 1
    let rowH = ROW_H_MIN
    for (let i = 0; i < columns.length; i += 1) {
      rowH = Math.max(rowH, measureCellHeight(doc, row[i] ?? '', widths[i], FONT_BODY))
    }
    const pageH = doc.internal.pageSize.getHeight()
    if (y + rowH > pageH - MARGIN) {
      doc.addPage()
      y = MARGIN
      y = drawHeaderRow(y)
    }
    if (isLast) {
      doc.setFillColor(250, 250, 250)
    } else if (rowIndex % 2 === 1) {
      doc.setFillColor(250, 250, 250)
    } else {
      doc.setFillColor(255, 255, 255)
    }
    let x = MARGIN
    for (let i = 0; i < columns.length; i += 1) {
      doc.rect(x, y, widths[i], rowH, isLast ? 'FD' : 'S')
      if (!isLast && rowIndex % 2 === 1) {
        doc.rect(x, y, widths[i], rowH, 'F')
        doc.rect(x, y, widths[i], rowH, 'S')
      }
      drawTextCell(
        doc,
        row[i] ?? '',
        x,
        y,
        widths[i],
        rowH,
        columns[i].align ?? 'left',
        isLast,
        FONT_BODY,
      )
      x += widths[i]
    }
    y += rowH
  })

  return y
}

export function generarHojaCobrosListadoPdfBlob(input: HojaCobrosListadoPdfInput): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.15)

  const pageW = doc.internal.pageSize.getWidth()
  let y = MARGIN

  if (input.logoDataUrl) {
    try {
      const format = input.logoDataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG'
      const maxW = 48
      const maxH = 18
      doc.addImage(input.logoDataUrl, format, (pageW - maxW) / 2, y, maxW, maxH, undefined, 'FAST')
      y += maxH + 4
    } catch {
      // continuar sin logo
    }
  }

  y = drawCenteredText(doc, `CARTERA: ${input.carteraEtiqueta || '—'}`, y, 10, true)
  y = drawCenteredText(doc, `FECHA: ${formatFechaHojaLegible(input.fechaReporteIso)}`, y, 10, true)
  y = drawCenteredText(
    doc,
    `GENERADO: ${formatDateTime(input.generadoEnIso || new Date().toISOString())}`,
    y,
    10,
    true,
  )
  y += 4

  const bodyRows: string[][] = input.filas.map((fila, index) => filaListadoHojaCobrosCeldas(fila, index))
  if (!bodyRows.length) {
    bodyRows.push(['', '', 'Sin préstamos en esta cartera.', '', '', '', '', '', '', '', ''])
  }
  bodyRows.push(filaTotalesListadoHojaCobros(input.filas))

  drawTable(doc, y, LISTADO_COLUMNS, bodyRows, { boldLastRow: true })

  return doc.output('blob')
}

export async function cargarLogoFindecoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}findeco-logo.png`)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export function nombreArchivoHojaCobrosListado(cartera: string, fechaReporteIso: string): string {
  const slug = (cartera || 'cartera')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '_')
    .toLowerCase()
  const fecha = (fechaReporteIso || '').replace(/-/g, '')
  return `hoja_cobros_${slug || 'cartera'}_${fecha || 'hoy'}.pdf`
}
