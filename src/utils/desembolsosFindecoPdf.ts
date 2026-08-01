import { jsPDF } from 'jspdf'

export interface DesembolsosFindecoPdfPrestamoRow {
  numero: number
  cliente: string
  fechaEntrega: string
  monto: string
  tasa: string
  plazo: string
  interes: string
}

export interface DesembolsosFindecoPdfEmisor {
  razonSocial: string
  nombreComercial: string
  rtn: string
  direccion: string
  ciudad: string
  telefono: string
  correo: string
}

export interface DesembolsosFindecoPdfBloque {
  nombreCartera: string
  prestamos: DesembolsosFindecoPdfPrestamoRow[]
  totales: { cantidad: number; monto: string; interes: string }
}

export interface DesembolsosFindecoPdfData {
  titulo: string
  carteraTitulo: string
  etiquetaPeriodo: string
  emisor: DesembolsosFindecoPdfEmisor
  logoDataUrl?: string | null
  bloques: DesembolsosFindecoPdfBloque[]
}

const MARGIN = 12
const ROW_H_MIN = 5.5
const FONT_BODY = 8
const FONT_SMALL = 7
const FONT_TITLE = 13
const FONT_SECTION = 10
const CELL_PAD = 1.4

type Align = 'left' | 'right' | 'center'

interface TableColumn {
  header: string
  width: number
  align?: Align
}

function lineHeightForFont(fontSize: number): number {
  return fontSize * 0.42
}

function wrapCellLines(doc: jsPDF, text: string, width: number, fontSize: number): string[] {
  const innerW = Math.max(4, width - CELL_PAD * 2)
  doc.setFontSize(fontSize)
  return doc.splitTextToSize(text, innerW) as string[]
}

function measureCellHeight(doc: jsPDF, text: string, width: number, fontSize: number): number {
  const lines = wrapCellLines(doc, text, width, fontSize)
  const lh = lineHeightForFont(fontSize)
  return CELL_PAD * 2 + lines.length * lh
}

function scaledColumnWidths(doc: jsPDF, columns: TableColumn[]): number[] {
  const pageW = doc.internal.pageSize.getWidth()
  const tableW = pageW - MARGIN * 2
  const totalDefined = columns.reduce((sum, col) => sum + col.width, 0)
  const scale = tableW / totalDefined
  return columns.map((col) => col.width * scale)
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
  const lines = wrapCellLines(doc, text, width, fontSize)
  const lineHeight = lineHeightForFont(fontSize)
  const blockH = lines.length * lineHeight
  let textY = y + Math.max(CELL_PAD, (height - blockH) / 2 + lineHeight * 0.85)
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

function drawTable(
  doc: jsPDF,
  y: number,
  columns: TableColumn[],
  rows: string[][],
  options?: { bodyFontSize?: number; boldLastRow?: boolean },
): number {
  const bodyFontSize = options?.bodyFontSize ?? FONT_BODY
  const boldLastRow = options?.boldLastRow === true
  const widths = scaledColumnWidths(doc, columns)

  function drawHeaderRow(startY: number): number {
    let headerH = ROW_H_MIN
    for (let i = 0; i < columns.length; i += 1) {
      headerH = Math.max(headerH, measureCellHeight(doc, columns[i].header, widths[i], FONT_BODY))
    }
    startY = ensureSpace(doc, startY, headerH + 1)
    let x = MARGIN
    for (let i = 0; i < columns.length; i += 1) {
      doc.rect(x, startY, widths[i], headerH)
      drawTextCell(doc, columns[i].header, x, startY, widths[i], headerH, columns[i].align ?? 'left', true)
      x += widths[i]
    }
    return startY + headerH
  }

  y = drawHeaderRow(y)

  rows.forEach((row, rowIndex) => {
    const isLast = boldLastRow && rowIndex === rows.length - 1
    let rowH = ROW_H_MIN
    for (let i = 0; i < columns.length; i += 1) {
      rowH = Math.max(rowH, measureCellHeight(doc, row[i] ?? '', widths[i], bodyFontSize))
    }
    const pageH = doc.internal.pageSize.getHeight()
    if (y + rowH > pageH - MARGIN) {
      doc.addPage()
      y = MARGIN
      y = drawHeaderRow(y)
    }
    let x = MARGIN
    for (let i = 0; i < columns.length; i += 1) {
      doc.rect(x, y, widths[i], rowH)
      drawTextCell(
        doc,
        row[i] ?? '',
        x,
        y,
        widths[i],
        rowH,
        columns[i].align ?? 'left',
        isLast,
        bodyFontSize,
      )
      x += widths[i]
    }
    y += rowH
  })

  return y + 2
}

function drawCenteredText(doc: jsPDF, text: string, y: number, fontSize: number, bold = false): number {
  const pageW = doc.internal.pageSize.getWidth()
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(fontSize)
  const lines = doc.splitTextToSize(text, pageW - MARGIN * 2) as string[]
  const lh = lineHeightForFont(fontSize) + 0.6
  for (const line of lines) {
    const tw = doc.getTextWidth(line)
    doc.text(line, (pageW - tw) / 2, y)
    y += lh
  }
  return y
}

function drawLogoAndEmisor(doc: jsPDF, data: DesembolsosFindecoPdfData): number {
  const pageW = doc.internal.pageSize.getWidth()
  let y = MARGIN

  if (data.logoDataUrl) {
    const maxW = 48
    const maxH = 16
    try {
      const format = data.logoDataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG'
      doc.addImage(data.logoDataUrl, format, (pageW - maxW) / 2, y, maxW, maxH, undefined, 'FAST')
      y += maxH + 3
    } catch {
      // Si el logo no carga, continuar solo con texto.
    }
  }

  const emisor = data.emisor
  const razon = emisor.razonSocial.trim() || 'FINDECO'
  y = drawCenteredText(doc, razon, y + 2, 11, true)

  const comercial = emisor.nombreComercial.trim()
  if (comercial && comercial.toLowerCase() !== razon.toLowerCase()) {
    y = drawCenteredText(doc, comercial, y + 0.5, 8, false)
  }

  const lineasContacto: string[] = []
  if (emisor.rtn.trim()) lineasContacto.push(`RTN: ${emisor.rtn.trim()}`)
  if (emisor.telefono.trim()) lineasContacto.push(`Tel: ${emisor.telefono.trim()}`)
  if (emisor.ciudad.trim()) lineasContacto.push(emisor.ciudad.trim())
  if (lineasContacto.length) {
    y = drawCenteredText(doc, lineasContacto.join('  ·  '), y + 0.8, 7.5, false)
  }
  if (emisor.direccion.trim()) {
    y = drawCenteredText(doc, emisor.direccion.trim(), y + 0.4, 7.5, false)
  }
  if (emisor.correo.trim()) {
    y = drawCenteredText(doc, emisor.correo.trim(), y + 0.4, 7.5, false)
  }

  y += 2
  doc.setLineWidth(0.4)
  doc.line(MARGIN, y, pageW - MARGIN, y)
  doc.setLineWidth(0.15)
  return y + 6
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

export function generateDesembolsosFindecoPdf(data: DesembolsosFindecoPdfData): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  applyReportStyle(doc)

  const pageW = doc.internal.pageSize.getWidth()
  let y = drawLogoAndEmisor(doc, data)

  y = drawCenteredText(doc, data.titulo, y, FONT_TITLE, true)
  y += 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT_BODY)
  const meta = [`Cartera: ${data.carteraTitulo}`, `Periodo: ${data.etiquetaPeriodo}`].join('  ·  ')
  const metaLines = doc.splitTextToSize(meta, pageW - MARGIN * 2) as string[]
  for (const line of metaLines) {
    doc.text(line, MARGIN, y)
    y += 4
  }
  y += 2

  for (const bloque of data.bloques) {
    y = drawSectionTitle(doc, y + 2, bloque.nombreCartera)
    const filas = bloque.prestamos.map((p) => [
      String(p.numero),
      p.cliente,
      p.fechaEntrega,
      p.monto,
      p.tasa,
      p.plazo,
      p.interes,
    ])
    if (bloque.prestamos.length > 0) {
      filas.push([
        String(bloque.totales.cantidad),
        'TOTAL',
        '',
        bloque.totales.monto,
        '',
        '',
        bloque.totales.interes,
      ])
    }
    y = drawTable(
      doc,
      y,
      [
        { header: 'N', width: 10, align: 'center' },
        { header: 'Nombre', width: 90, align: 'left' },
        { header: 'Entrega', width: 22, align: 'center' },
        { header: 'Monto', width: 28, align: 'right' },
        { header: 'Tasa', width: 18, align: 'right' },
        { header: 'Plazo', width: 14, align: 'center' },
        { header: 'Interés', width: 28, align: 'right' },
      ],
      filas,
      { bodyFontSize: FONT_SMALL, boldLastRow: bloque.prestamos.length > 0 },
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
