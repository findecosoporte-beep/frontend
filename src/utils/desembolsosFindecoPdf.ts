import { jsPDF } from 'jspdf'

export interface DesembolsosFindecoPdfPrestamoRow {
  numero: number
  codigo: string
  cliente: string
  fechaEntrega: string
  monto: string
  tasa: string
  plazo: string
  interes: string
}

export interface DesembolsosFindecoPdfFilaFecha {
  fecha: string
  cantidad: number
  monto: string
  interes: string
}

export interface DesembolsosFindecoPdfBloque {
  nombreCartera: string
  cantidad: number
  montoTotal: string
  interesTotal: string
  porFecha: DesembolsosFindecoPdfFilaFecha[]
  prestamos: DesembolsosFindecoPdfPrestamoRow[]
}

export interface DesembolsosFindecoPdfData {
  titulo: string
  carteraTitulo: string
  etiquetaPeriodo: string
  totales: { cantidad: number; monto: string; interes: string }
  bloques: DesembolsosFindecoPdfBloque[]
}

const MARGIN = 12
const ROW_H = 5.2
const FONT_BODY = 8
const FONT_SMALL = 7
const FONT_TITLE = 13
const FONT_SECTION = 10

type Align = 'left' | 'right' | 'center'

interface TableColumn {
  header: string
  width: number
  align?: Align
}

function applyReportStyle(doc: jsPDF) {
  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.15)
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageH = doc.internal.pageSize.getHeight()
  if (y + needed > pageH - MARGIN) {
    doc.addPage()
    return MARGIN
  }
  return y
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
  const padding = 1.2
  const lines = doc.splitTextToSize(text, width - padding * 2) as string[]
  const lineHeight = fontSize * 0.38
  let textY = y + padding + lineHeight
  for (const line of lines) {
    let textX = x + padding
    if (align === 'right') {
      textX = x + width - padding - doc.getTextWidth(line)
    } else if (align === 'center') {
      textX = x + (width - doc.getTextWidth(line)) / 2
    }
    doc.text(line, textX, textY)
    textY += lineHeight
  }
}

function drawTable(
  doc: jsPDF,
  startY: number,
  columns: TableColumn[],
  rows: string[][],
  options?: { headerFill?: boolean },
): number {
  const pageW = doc.internal.pageSize.getWidth()
  const tableW = pageW - MARGIN * 2
  const colWidths = columns.map((c) => c.width)
  const totalDefined = colWidths.reduce((a, b) => a + b, 0)
  const scale = tableW / totalDefined
  const scaledWidths = colWidths.map((w) => w * scale)

  let y = startY

  const drawHeader = () => {
    y = ensureSpace(doc, y, ROW_H + 2)
    let x = MARGIN
    if (options?.headerFill !== false) {
      doc.setFillColor(235, 235, 235)
      doc.rect(MARGIN, y, tableW, ROW_H, 'FD')
    } else {
      doc.rect(MARGIN, y, tableW, ROW_H, 'D')
    }
    columns.forEach((col, i) => {
      if (i > 0) {
        doc.line(x, y, x, y + ROW_H)
      }
      drawTextCell(doc, col.header, x, y, scaledWidths[i], ROW_H, col.align ?? 'left', true, FONT_SMALL)
      x += scaledWidths[i]
    })
    y += ROW_H
  }

  drawHeader()

  for (const row of rows) {
    y = ensureSpace(doc, y, ROW_H + 2)
    let x = MARGIN
    doc.setFillColor(255, 255, 255)
    doc.rect(MARGIN, y, tableW, ROW_H, 'D')
    row.forEach((cell, i) => {
      if (i > 0) {
        doc.line(x, y, x, y + ROW_H)
      }
      drawTextCell(doc, cell, x, y, scaledWidths[i], ROW_H, columns[i]?.align ?? 'left')
      x += scaledWidths[i]
    })
    y += ROW_H
  }

  return y + 3
}

function drawSectionTitle(doc: jsPDF, y: number, text: string): number {
  y = ensureSpace(doc, y, 10)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT_SECTION)
  doc.text(text, MARGIN, y)
  const pageW = doc.internal.pageSize.getWidth()
  doc.setLineWidth(0.25)
  doc.line(MARGIN, y + 1.5, pageW - MARGIN, y + 1.5)
  return y + 7
}

function drawSubtitle(doc: jsPDF, y: number, text: string): number {
  y = ensureSpace(doc, y, 8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT_BODY)
  doc.text(text, MARGIN, y)
  return y + 5
}

export function generateDesembolsosFindecoPdf(data: DesembolsosFindecoPdfData): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  applyReportStyle(doc)

  const pageW = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT_TITLE)
  const titleW = doc.getTextWidth(data.titulo)
  doc.text(data.titulo, (pageW - titleW) / 2, MARGIN + 4)

  doc.setLineWidth(0.4)
  doc.line(MARGIN, MARGIN + 7, pageW - MARGIN, MARGIN + 7)
  doc.setLineWidth(0.15)

  let y = MARGIN + 13
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT_BODY)
  const meta = [
    `Cartera: ${data.carteraTitulo}`,
    `Periodo: ${data.etiquetaPeriodo}`,
    `Préstamos: ${data.totales.cantidad}`,
    `Monto: ${data.totales.monto}`,
    `Interés: ${data.totales.interes}`,
  ].join('  ·  ')
  const metaLines = doc.splitTextToSize(meta, pageW - MARGIN * 2) as string[]
  for (const line of metaLines) {
    doc.text(line, MARGIN, y)
    y += 4
  }
  y += 2

  y = drawSectionTitle(doc, y, 'Resumen por cartera')
  y = drawTable(
    doc,
    y,
    [
      { header: 'Cartera', width: 50, align: 'left' },
      { header: 'Préstamos', width: 18, align: 'right' },
      { header: 'Monto', width: 28, align: 'right' },
      { header: 'Interés', width: 28, align: 'right' },
    ],
    data.bloques.map((b) => [b.nombreCartera, String(b.cantidad), b.montoTotal, b.interesTotal]),
  )

  for (const bloque of data.bloques) {
    y = drawSectionTitle(doc, y + 2, bloque.nombreCartera)

    y = drawSubtitle(doc, y, 'Desglose por día de entrega')
    y = drawTable(
      doc,
      y,
      [
        { header: 'Fecha', width: 30, align: 'left' },
        { header: 'Préstamos', width: 18, align: 'right' },
        { header: 'Monto', width: 28, align: 'right' },
        { header: 'Interés', width: 28, align: 'right' },
      ],
      bloque.porFecha.map((f) => [f.fecha, String(f.cantidad), f.monto, f.interes]),
    )

    y = drawSubtitle(doc, y, 'Detalle')
    y = drawTable(
      doc,
      y,
      [
        { header: 'N', width: 8, align: 'right' },
        { header: 'Nº préstamo', width: 22, align: 'left' },
        { header: 'Nombre', width: 38, align: 'left' },
        { header: 'Entrega', width: 20, align: 'left' },
        { header: 'Monto', width: 22, align: 'right' },
        { header: 'Tasa', width: 16, align: 'right' },
        { header: 'Plazo', width: 14, align: 'right' },
        { header: 'Interés', width: 22, align: 'right' },
      ],
      bloque.prestamos.map((p) => [
        String(p.numero),
        p.codigo,
        p.cliente,
        p.fechaEntrega,
        p.monto,
        p.tasa,
        p.plazo,
        p.interes,
      ]),
    )
  }

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT_SMALL)
    const footer = `Página ${i} de ${totalPages}`
    const footerW = doc.getTextWidth(footer)
    doc.text(footer, pageW - MARGIN - footerW, doc.internal.pageSize.getHeight() - 6)
  }

  return doc.output('blob')
}

export function descargarDesembolsosFindecoPdf(blob: Blob, titulo: string) {
  const safeName = titulo.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'reporte_desembolsos'
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeName}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}
