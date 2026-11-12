import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const PDF_MARGIN_MM = 5
/** Ancho mínimo de la tabla en pantalla (56rem) → captura completa sin scroll horizontal. */
const TABLA_MIN_WIDTH_PX = 896
/** Filas de clientes por página (hoja carta vertical con logo + encabezado). */
const FILAS_POR_PAGINA_PDF = 34

function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))
  if (!imgs.length) return Promise.resolve()
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) resolve()
          else {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          }
        }),
    ),
  ).then(() => undefined)
}

function prepararEstilosCaptura(clone: HTMLElement, captureWidth: number) {
  clone.classList.add('hoja-exportando-pdf')
  clone.style.boxShadow = 'none'
  clone.style.width = `${captureWidth}px`
  clone.style.minWidth = `${TABLA_MIN_WIDTH_PX}px`

  const scroll = clone.querySelector('.hoja-preview-scroll') as HTMLElement | null
  if (scroll) {
    scroll.style.overflow = 'visible'
    scroll.style.maxHeight = 'none'
  }

  clone.querySelectorAll('.hoja-listado-row--clickable').forEach((row) => {
    row.classList.remove('hoja-listado-row--clickable')
  })
}

function montarHostCaptura(clone: HTMLElement): { host: HTMLElement; cleanup: () => void } {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;left:-20000px;top:0;z-index:-9999;background:#fff;padding:0;margin:0;width:max-content;'
  host.appendChild(clone)
  document.body.appendChild(host)
  return { host, cleanup: () => host.remove() }
}

async function capturarElemento(root: HTMLElement): Promise<HTMLCanvasElement> {
  await waitForImages(root)
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
  return html2canvas(root, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    width: root.scrollWidth,
    height: root.scrollHeight,
    windowWidth: root.scrollWidth,
    windowHeight: root.scrollHeight,
  })
}

function agregarCanvasAPdf(doc: jsPDF, canvas: HTMLCanvasElement, nuevaPagina: boolean) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const printableW = pageW - PDF_MARGIN_MM * 2
  const printableH = pageH - PDF_MARGIN_MM * 2

  const imgW = printableW
  let imgH = (canvas.height * imgW) / canvas.width
  const imgData = canvas.toDataURL('image/png', 1.0)

  if (nuevaPagina) doc.addPage()

  if (imgH <= printableH) {
    const x = PDF_MARGIN_MM + (printableW - imgW) / 2
    doc.addImage(imgData, 'PNG', x, PDF_MARGIN_MM, imgW, imgH, undefined, 'SLOW')
    return
  }

  let sliceTop = 0
  let sliceIndex = 0
  while (sliceTop < imgH - 0.5) {
    if (sliceIndex > 0) doc.addPage()
    doc.addImage(
      imgData,
      'PNG',
      PDF_MARGIN_MM,
      PDF_MARGIN_MM - sliceTop,
      imgW,
      imgH,
      undefined,
      'SLOW',
    )
    sliceTop += printableH
    sliceIndex += 1
  }
}

function clonarFragmentoHoja(
  root: HTMLElement,
  captureWidth: number,
  filaIndices: number[] | null,
  incluirTotales: boolean,
): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement
  prepararEstilosCaptura(clone, captureWidth)

  const tbody = clone.querySelector('tbody')
  if (tbody && filaIndices) {
    const filas = Array.from(tbody.querySelectorAll('tr'))
    const keep = new Set(filaIndices)
    filas.forEach((tr, idx) => {
      if (!keep.has(idx)) tr.remove()
    })
    Array.from(tbody.querySelectorAll('tr')).forEach((tr, i) => {
      const celdaN = tr.querySelector('.col-n')
      if (celdaN) celdaN.textContent = String(filaIndices[i]! + 1)
    })
  }

  const tfoot = clone.querySelector('tfoot')
  if (tfoot && !incluirTotales) tfoot.remove()

  return clone
}

function partirIndices(totalFilas: number, porPagina: number): number[][] {
  const chunks: number[][] = []
  for (let start = 0; start < totalFilas; start += porPagina) {
    const end = Math.min(start + porPagina, totalFilas)
    const indices: number[] = []
    for (let i = start; i < end; i += 1) indices.push(i)
    chunks.push(indices)
  }
  return chunks
}

/** PDF como la hoja en pantalla; listas largas van en varias páginas con encabezado repetido. */
export async function generarHojaCobrosListadoPdfDesdeElemento(root: HTMLElement): Promise<Blob> {
  const scrollHost = root.querySelector('.hoja-preview-scroll') as HTMLElement | null
  const prevOverflow = scrollHost?.style.overflow
  const prevMaxHeight = scrollHost?.style.maxHeight
  if (scrollHost) {
    scrollHost.style.overflow = 'visible'
    scrollHost.style.maxHeight = 'none'
  }

  const captureWidth = Math.max(root.scrollWidth, root.offsetWidth, TABLA_MIN_WIDTH_PX)
  const filas = root.querySelectorAll('tbody tr')
  const totalFilas = filas.length

  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
    let primeraPagina = true

    if (totalFilas <= FILAS_POR_PAGINA_PDF) {
      const clone = clonarFragmentoHoja(root, captureWidth, null, true)
      const { cleanup } = montarHostCaptura(clone)
      try {
        const canvas = await capturarElemento(clone)
        agregarCanvasAPdf(doc, canvas, false)
      } finally {
        cleanup()
      }
      return doc.output('blob')
    }

    const chunks = partirIndices(totalFilas, FILAS_POR_PAGINA_PDF)
    for (let c = 0; c < chunks.length; c += 1) {
      const esUltima = c === chunks.length - 1
      const fragment = clonarFragmentoHoja(root, captureWidth, chunks[c]!, esUltima)
      const { cleanup } = montarHostCaptura(fragment)
      try {
        const canvas = await capturarElemento(fragment)
        agregarCanvasAPdf(doc, canvas, !primeraPagina)
        primeraPagina = false
      } finally {
        cleanup()
      }
    }

    return doc.output('blob')
  } finally {
    if (scrollHost) {
      scrollHost.style.overflow = prevOverflow ?? ''
      scrollHost.style.maxHeight = prevMaxHeight ?? ''
    }
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
