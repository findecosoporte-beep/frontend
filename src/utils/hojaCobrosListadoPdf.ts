import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const PDF_MARGIN_MM = 6
/** Filas de clientes por página (hoja carta vertical, letra más grande). */
const FILAS_POR_PAGINA_PDF = 28
/** Escala de captura: más alta = impresión más nítida. */
const CAPTURA_SCALE = 3

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

function filaTieneCliente(tr: HTMLElement): boolean {
  const prestamo = (tr.querySelector('.col-prestamo')?.textContent || '').trim()
  const nombre = (tr.querySelector('.col-nombre')?.textContent || '').trim()
  return Boolean(prestamo || nombre)
}

function prepararEstilosCaptura(clone: HTMLElement) {
  clone.classList.add('hoja-exportando-pdf')
  clone.style.boxShadow = 'none'
  clone.style.border = 'none'
  clone.style.borderRadius = '0'
  clone.style.padding = '0'
  clone.style.background = '#ffffff'
  clone.style.width = 'max-content'
  clone.style.minWidth = '0'
  clone.style.maxWidth = 'none'

  const scroll = clone.querySelector('.hoja-preview-scroll') as HTMLElement | null
  if (scroll) {
    scroll.style.overflow = 'visible'
    scroll.style.maxHeight = 'none'
    scroll.style.border = 'none'
  }

  clone.querySelectorAll('.no-print').forEach((el) => {
    ;(el as HTMLElement).style.display = 'none'
  })

  clone.querySelectorAll('.hoja-listado-row--clickable').forEach((row) => {
    row.classList.remove('hoja-listado-row--clickable')
  })

  const tbody = clone.querySelector('tbody')
  if (tbody) {
    Array.from(tbody.querySelectorAll('tr')).forEach((tr) => {
      if (!filaTieneCliente(tr as HTMLElement)) tr.remove()
    })
  }
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
    scale: CAPTURA_SCALE,
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
  filaIndices: number[] | null,
  incluirTotales: boolean,
): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement
  prepararEstilosCaptura(clone)

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

  const filas = Array.from(root.querySelectorAll('tbody tr')).filter((tr) =>
    filaTieneCliente(tr as HTMLElement),
  )
  const totalFilas = filas.length

  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
    let primeraPagina = true

    if (totalFilas <= FILAS_POR_PAGINA_PDF) {
      const clone = clonarFragmentoHoja(root, null, true)
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
      const fragment = clonarFragmentoHoja(root, chunks[c]!, esUltima)
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
