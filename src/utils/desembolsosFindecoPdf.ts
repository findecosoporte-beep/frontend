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
  semanas?: DesembolsosFindecoPdfSemana[]
  prestamos: DesembolsosFindecoPdfPrestamoRow[]
  totales: { cantidad: number; monto: string; interes: string }
}

export interface DesembolsosFindecoPdfSemana {
  etiqueta: string
  prestamos: DesembolsosFindecoPdfPrestamoRow[]
  totales: { cantidad: number; monto: string; interes: string }
}

export interface DesembolsosFindecoPdfResumenFila {
  etiqueta: string
  cantidad: number
  monto: string
  interes: string
}

export type DesembolsosFindecoPdfNivelResumen = 'semanal' | 'mensual' | 'anual'

export interface DesembolsosFindecoPdfResumenes {
  nivel: DesembolsosFindecoPdfNivelResumen
  semanal: DesembolsosFindecoPdfResumenFila[]
  mensual: DesembolsosFindecoPdfResumenFila[]
  anual: DesembolsosFindecoPdfResumenFila[]
  totalPeriodo: DesembolsosFindecoPdfResumenFila
}

export interface DesembolsosFindecoPdfData {
  titulo: string
  carteraTitulo: string
  etiquetaPeriodo: string
  emisor: DesembolsosFindecoPdfEmisor
  logoDataUrl?: string | null
  resumenes: DesembolsosFindecoPdfResumenes
  bloques: DesembolsosFindecoPdfBloque[]
}

const MARGIN = 14
const ROW_H_MIN = 6.2
const FONT_BODY = 9
const FONT_SMALL = 8
const FONT_TITLE = 14
const FONT_SECTION = 11
const FONT_META = 9
const CELL_PAD = 1.8
const GAP_AFTER_TABLE = 5
const GAP_BEFORE_SUBTITLE = 6
const GAP_SECTION = 8

type Align = 'left' | 'right' | 'center'

interface TableColumn {
  header: string
  width: number
  align?: Align
}

function lineHeightForFont(fontSize: number): number {
  return fontSize * 0.38
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

function ensureSpace(doc: jsPDF, y: number, needed: number, allowPageBreak = true): number {
  if (!allowPageBreak) return y
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

function drawTable(
  doc: jsPDF,
  y: number,
  columns: TableColumn[],
  rows: string[][],
  options?: { bodyFontSize?: number; boldLastRow?: boolean; allowPageBreak?: boolean },
): number {
  const bodyFontSize = options?.bodyFontSize ?? FONT_BODY
  const boldLastRow = options?.boldLastRow === true
  const allowPageBreak = options?.allowPageBreak !== false
  const widths = scaledColumnWidths(doc, columns)

  function drawHeaderRow(startY: number): number {
    let headerH = ROW_H_MIN
    for (let i = 0; i < columns.length; i += 1) {
      headerH = Math.max(headerH, measureCellHeight(doc, columns[i].header, widths[i], FONT_BODY))
    }
    startY = ensureSpace(doc, startY, headerH + 1, allowPageBreak)
    let x = MARGIN
    for (let i = 0; i < columns.length; i += 1) {
      doc.rect(x, startY, widths[i], headerH)
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
      rowH = Math.max(rowH, measureCellHeight(doc, row[i] ?? '', widths[i], bodyFontSize))
    }
    if (allowPageBreak) {
      const pageH = doc.internal.pageSize.getHeight()
      if (y + rowH > pageH - MARGIN) {
        doc.addPage()
        y = MARGIN
        y = drawHeaderRow(y)
      }
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

  return y + GAP_AFTER_TABLE
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

function drawSectionTitle(doc: jsPDF, y: number, text: string, allowPageBreak = true): number {
  y = ensureSpace(doc, y, 10, allowPageBreak)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT_SECTION)
  doc.text(text, MARGIN, y)
  const pageW = doc.internal.pageSize.getWidth()
  doc.setLineWidth(0.25)
  doc.line(MARGIN, y + 1.5, pageW - MARGIN, y + 1.5)
  return y + 7
}

function drawWeekSubtitle(
  doc: jsPDF,
  y: number,
  text: string,
  allowPageBreak = true,
  withLeadingGap = true,
): number {
  y = ensureSpace(doc, y, 10, allowPageBreak)
  if (withLeadingGap) y += GAP_BEFORE_SUBTITLE
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT_BODY)
  doc.text(text, MARGIN, y)
  return y + 5
}

const PRESTAMO_TABLE_COLUMNS: TableColumn[] = [
  { header: 'N', width: 8, align: 'center' },
  { header: 'Nombre', width: 92, align: 'left' },
  { header: 'Entrega', width: 24, align: 'center' },
  { header: 'Monto', width: 30, align: 'right' },
  { header: 'Tasa', width: 18, align: 'center' },
  { header: 'Plazo', width: 14, align: 'center' },
  { header: 'Interés', width: 30, align: 'right' },
]

function prestamoRowsForTable(
  prestamos: DesembolsosFindecoPdfPrestamoRow[],
  totales: { cantidad: number; monto: string; interes: string },
): string[][] {
  const filas = prestamos.map((p) => [
    String(p.numero),
    p.cliente,
    p.fechaEntrega,
    p.monto,
    p.tasa,
    p.plazo,
    p.interes,
  ])
  if (prestamos.length > 0) {
    filas.push([String(totales.cantidad), 'TOTAL', '', totales.monto, '', '', totales.interes])
  }
  return filas
}

function measureTableHeight(doc: jsPDF, columns: TableColumn[], rows: string[][], bodyFontSize: number): number {
  const widths = scaledColumnWidths(doc, columns)
  let headerH = ROW_H_MIN
  for (let i = 0; i < columns.length; i += 1) {
    headerH = Math.max(headerH, measureCellHeight(doc, columns[i].header, widths[i], FONT_BODY))
  }
  let h = headerH
  for (const row of rows) {
    let rowH = ROW_H_MIN
    for (let i = 0; i < columns.length; i += 1) {
      rowH = Math.max(rowH, measureCellHeight(doc, row[i] ?? '', widths[i], bodyFontSize))
    }
    h += rowH
  }
  return h + GAP_AFTER_TABLE
}

function measureBloqueCarteraHeight(doc: jsPDF, bloque: DesembolsosFindecoPdfBloque, bodyFontSize: number): number {
  let h = 0
  const semanas = bloque.semanas?.length ? bloque.semanas : null
  const mostrarTotalCartera = Boolean(semanas && semanas.length > 1)

  if (semanas) {
    for (const semana of semanas) {
      if (semana.etiqueta) h += 5
      h += measureTableHeight(
        doc,
        PRESTAMO_TABLE_COLUMNS,
        prestamoRowsForTable(semana.prestamos, semana.totales),
        bodyFontSize,
      )
    }
  } else {
    h += measureTableHeight(
      doc,
      PRESTAMO_TABLE_COLUMNS,
      prestamoRowsForTable(bloque.prestamos, bloque.totales),
      bodyFontSize,
    )
  }

  if (mostrarTotalCartera) {
    h += GAP_BEFORE_SUBTITLE + 5
    h += measureTableHeight(
      doc,
      [
        { header: 'Concepto', width: 70, align: 'left' },
        { header: 'Préstamos', width: 22, align: 'center' },
        { header: 'Monto', width: 38, align: 'right' },
        { header: 'Interés', width: 38, align: 'right' },
      ],
      [['Total cartera', String(bloque.totales.cantidad), bloque.totales.monto, bloque.totales.interes]],
      bodyFontSize,
    )
  }

  return h
}

function fitFontSizeForBloque(doc: jsPDF, bloque: DesembolsosFindecoPdfBloque, availableHeight: number): number {
  let fontSize = FONT_BODY
  while (fontSize >= 6 && measureBloqueCarteraHeight(doc, bloque, fontSize) > availableHeight) {
    fontSize -= 0.5
  }
  return fontSize
}

function drawPrestamoTable(
  doc: jsPDF,
  y: number,
  prestamos: DesembolsosFindecoPdfPrestamoRow[],
  totales: { cantidad: number; monto: string; interes: string },
  options?: { bodyFontSize?: number; allowPageBreak?: boolean },
): number {
  const bodyFontSize = options?.bodyFontSize ?? FONT_BODY
  return drawTable(doc, y, PRESTAMO_TABLE_COLUMNS, prestamoRowsForTable(prestamos, totales), {
    bodyFontSize,
    boldLastRow: prestamos.length > 0,
    allowPageBreak: options?.allowPageBreak,
  })
}

function drawResumenTable(
  doc: jsPDF,
  y: number,
  filas: DesembolsosFindecoPdfResumenFila[],
  options?: { boldLastRow?: boolean },
): number {
  const rows = filas.map((f) => [f.etiqueta, String(f.cantidad), f.monto, f.interes])
  return drawTable(
    doc,
    y,
    [
      { header: 'Periodo', width: 70, align: 'left' },
      { header: 'Préstamos', width: 22, align: 'center' },
      { header: 'Monto', width: 38, align: 'right' },
      { header: 'Interés', width: 38, align: 'right' },
    ],
    rows,
    { bodyFontSize: FONT_BODY, boldLastRow: options?.boldLastRow ?? false },
  )
}

function drawResumenesConsolidados(doc: jsPDF, y: number, resumenes: DesembolsosFindecoPdfResumenes): number {
  y = drawSectionTitle(doc, y + 2, 'Resumen consolidado (todas las carteras)')

  let titulo = ''
  let filas: DesembolsosFindecoPdfResumenFila[] = []

  if (resumenes.nivel === 'semanal') {
    titulo = 'Resumen semanal'
    filas = resumenes.semanal
  } else if (resumenes.nivel === 'mensual') {
    titulo = 'Resumen mensual'
    filas = resumenes.mensual
  } else {
    titulo = 'Resumen anual'
    filas = resumenes.anual
  }

  if (filas.length === 0) return y + 4

  y = drawWeekSubtitle(doc, y, titulo)
  y = drawResumenTable(doc, y, filas, { boldLastRow: true })

  return y + 4
}

function drawCompactCarteraHeader(
  doc: jsPDF,
  data: DesembolsosFindecoPdfData,
  bloque: DesembolsosFindecoPdfBloque,
): number {
  const pageW = doc.internal.pageSize.getWidth()
  let y = MARGIN + 2

  y = drawCenteredText(doc, data.titulo, y, FONT_TITLE, true)
  y += 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT_META)
  const metaCartera = `Cartera: ${bloque.nombreCartera}`
  y = drawCenteredText(doc, metaCartera, y, FONT_META, false)
  y += 1
  const metaPeriodo = `Periodo: ${data.etiquetaPeriodo}`
  y = drawCenteredText(doc, metaPeriodo, y, FONT_META, false)

  y += 3
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, pageW - MARGIN, y)
  doc.setLineWidth(0.15)
  return y + GAP_SECTION
}

function drawBloqueCartera(doc: jsPDF, data: DesembolsosFindecoPdfData, bloque: DesembolsosFindecoPdfBloque): void {
  doc.addPage()
  let y = drawCompactCarteraHeader(doc, data, bloque)

  const pageH = doc.internal.pageSize.getHeight()
  const availableHeight = pageH - y - MARGIN - 8
  const bodyFontSize = fitFontSizeForBloque(doc, bloque, availableHeight)

  const semanas = bloque.semanas?.length ? bloque.semanas : null
  const mostrarTotalCartera = Boolean(semanas && semanas.length > 1)
  if (semanas) {
    let primeraSemana = true
    for (const semana of semanas) {
      if (semana.etiqueta) {
        y = drawWeekSubtitle(doc, y, semana.etiqueta, false, !primeraSemana)
        primeraSemana = false
      }
      y = drawPrestamoTable(doc, y, semana.prestamos, semana.totales, {
        bodyFontSize,
        allowPageBreak: false,
      })
    }
  } else {
    y = drawPrestamoTable(doc, y, bloque.prestamos, bloque.totales, {
      bodyFontSize,
      allowPageBreak: false,
    })
  }

  if (mostrarTotalCartera) {
    y = drawWeekSubtitle(doc, y, 'Total cartera', false, true)
    drawResumenTable(
      doc,
      y,
      [{
        etiqueta: bloque.nombreCartera,
        cantidad: bloque.totales.cantidad,
        monto: bloque.totales.monto,
        interes: bloque.totales.interes,
      }],
      { boldLastRow: true },
    )
  }
}

export function generateDesembolsosFindecoPdf(data: DesembolsosFindecoPdfData): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  applyReportStyle(doc)

  const pageW = doc.internal.pageSize.getWidth()
  let y = drawLogoAndEmisor(doc, data)

  y = drawCenteredText(doc, data.titulo, y, FONT_TITLE, true)
  y += 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT_META)
  const metaCartera = `Cartera: ${data.carteraTitulo}`
  y = drawCenteredText(doc, metaCartera, y, FONT_META, false)
  y += 1
  const metaPeriodo = `Periodo: ${data.etiquetaPeriodo}`
  y = drawCenteredText(doc, metaPeriodo, y, FONT_META, false)
  y += GAP_SECTION

  y = drawResumenesConsolidados(doc, y, data.resumenes)

  for (const bloque of data.bloques) {
    drawBloqueCartera(doc, data, bloque)
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
