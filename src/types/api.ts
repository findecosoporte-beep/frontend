export interface Paginated<T> {
  count: number
  /** Solo con ``StablePageNumberPagination`` del API (página efectiva tras clamp). */
  page?: number
  next: string | null
  previous: string | null
  results: T[]
}

export type RolOperativo =
  | 'administrador'
  | 'asesor'
  | 'supervisor'
  | 'cobrador'
  | 'cobranza_adm_jud'

export interface MeProfile {
  username: string
  email: string
  vinculado: boolean
  rol: RolOperativo | null
  nombre_operativo: string | null
  id_usuario?: number | null
  carteras?: CarteraAsignada[]
}

export interface CarteraAsignada {
  id_cartera: number
  nombre: string
  dia_cobro: DiaCobroCartera
}

export interface Cliente {
  id_cliente: number
  nombre: string
  dni: string
  /** RTN (persona jurídica o facturación). */
  rtn: string | null
  telefono: string | null
  direccion_residencia: string | null
  direccion_negocio: string | null
  referencia: string | null
  referencia_parentesco: string | null
  referencia_telefono: string | null
  actividad_economica: string | null
  /** Día de la semana preferido para cobro/visita (mismas claves que zona/cartera). */
  dia_cobro_semanal: DiaCobroCartera | null
  /** Alta en el sistema (ISO datetime). */
  creado_en?: string | null
  /** Cantidad de préstamos vinculados (solo en listado API). */
  total_prestamos?: number
}

export interface UsuarioRow {
  id_usuario: number
  nombre: string
  rol: RolOperativo
  correo: string | null
  carteras?: number[]
  carteras_detalle?: CarteraAsignada[]
}

/** Celda de la hoja semanal GET /pagos/hoja-semanal-cuotas/ */
export interface HojaSemanalCuotaCelda {
  id_cuota: number
  numero_cuota: number
  fecha_programada: string
  capital_programado: string
  interes_programado: string
  total_programado: string
  saldo_capital_programado: string
  estado_cuota: string
  pagado: boolean
  fecha_pago: string | null
  id_pago: number | null
}

export interface HojaSemanalColumna {
  fecha_cuota: string
  titulo: string
}

export interface HojaSemanalFila {
  id_prestamo: number
  numero_prestamo: string
  id_cliente: number | null
  nombre_cliente: string
  dni_cliente: string
  id_zona: number | null
  nombre_zona: string
  estado_prestamo: string
  cuotas: Record<string, HojaSemanalCuotaCelda | null>
}

export interface HojaSemanalCuotasResponse {
  columnas: HojaSemanalColumna[]
  filas: HojaSemanalFila[]
}

/** Valores alineados con `Cartera.DIA_COBRO_CHOICES` y `Zona.dia_semana` en el API. */
export type DiaCobroCartera =
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes'
  | 'sabado'
  | 'domingo'

export interface Zona {
  id_zona: number
  codigo: string
  nombre: string
  /** Día de semana de ruta/cobro (`null` si aún no se asignó o registro heredado). */
  dia_semana: DiaCobroCartera | null
}

export interface Cartera {
  id_cartera: number
  nombre: string
  dia_cobro: DiaCobroCartera
  /** Presente si la cartera se generó al guardar la zona (`id_zona` en catálogo). */
  id_zona?: number | null
}

export interface Prestamo {
  id_prestamo: number
  numero_prestamo: string
  sucursal: string | null
  id_zona?: number | null
  zona?: Zona | null
  id_cartera?: number | null
  cartera?: Cartera | null
  ciclos: number
  supervisor: string | null
  asesor: string | null
  dias_mora: number
  categoria_crediticia: string | null
  id_cliente: number
  /** Nombre del cliente (viene del API; evita bajar el catálogo de clientes). */
  cliente_nombre?: string | null
  id_usuario: number
  monto: string | number
  plazo: number
  tasa_interes: string | number
  tipo_garantia: string | null
  estado: string
  forma_pago: string
  forma_desembolso: string
  comision: string | number
  producto: string | null
  categoria: string | null
  fecha_entrega: string
  fecha_vencimiento: string
  /** Registro del préstamo en el sistema (ISO datetime). */
  creado_en?: string | null
  /** Usuario operativo que registró el préstamo (no confundir con id_usuario = asesor). */
  creado_por?: number | null
  creado_por_nombre?: string | null
  modificado_por?: number | null
  modificado_por_nombre?: string | null
  actualizado_en?: string | null
}

/** Respuesta de GET /prestamos/reporte-integracion/ */
export interface ReporteIntegracionFila {
  id_prestamo: number
  numero_prestamo: string
  nombre_cliente: string
  fecha_entrega: string
  fecha_vencimiento: string
  dias_mora: number
  saldo_inicial: string
  monto?: string
  cuota: string
  saldo_actual: string
  ciclos: number
  asesor: string
  estado: string
  forma_pago?: string
  sucursal: string
  plazo: number
  plazo_total?: number | null
  total_cuotas_plan?: number | null
  /** Primera cuota del plan sin pago registrado con documento «Cuota N». */
  cuota_siguiente_numero?: number | null
  cuota_siguiente_fecha?: string | null
  cuota_siguiente_monto?: string | null
  cuota_siguiente_monto_programado?: string | null
  cuota_siguiente_abonado?: string | null
  cuota_anterior_numero?: number | null
  cuota_anterior_abonado?: string | null
  total_abono_anterior_mas_cuota?: string | null
  cuota_siguiente_capital?: string | null
  cuota_siguiente_interes?: string | null
  cuota_siguiente_saldo_capital?: string | null
  /** Cuotas vencidas sin pago completo (según plan y fecha de hoy). */
  cuotas_atrasadas?: number
  cuotas_atrasadas_numeros?: string
  fecha_ultimo_pago?: string
  monto_ultimo_pago?: string
  id_cartera?: number | null
  cartera_nombre?: string
  cartera_dia_cobro?: string
  cliente_dia_cobro_semanal?: string
  telefono?: string
}

export interface ReporteIntegracionResumen {
  clientes_distintos: number
  prestamos: number
  total_cuotas_plazo: number
  total_saldo_inicial: string
  total_saldo_actual: string
  total_cuota?: string
}

export interface ReporteIntegracionResponse {
  fecha_reporte: string
  /** Momento de generación del reporte (ISO datetime). */
  generado_en?: string
  filas: ReporteIntegracionFila[]
  resumen: ReporteIntegracionResumen
  /** Paginación (GET reporte-integracion con page/page_size). */
  count?: number
  page?: number
  next?: string | null
  previous?: string | null
}

/** Línea del resumen cuando POST /pagos/ reparte el cobro en varias cuotas. */
export interface PagoDistribucionLinea {
  cuota?: number
  abono_capital?: boolean
  liquida_prestamo?: boolean
  capital?: string
  interes?: string
  mora?: string
  total: string
  parcial?: boolean
}

export interface Pago {
  id_pago: number
  id_prestamo: number
  fecha_pago: string
  /** Hora del cobro (ISO datetime). */
  cobrado_en?: string | null
  documento: string | null
  capital: string | number
  interes: string | number
  mora: string | number
  saldo: string | number
  /** Cobro anulado (no cuenta en saldos). */
  anulado?: boolean
  /** Si existe, este pago es línea secundaria; la factura está en el pago maestro. */
  id_pago_factura?: number | null
  /** Efectivo que entregó el cliente (factura). */
  monto_recibido_cliente?: string | number | null
  /** Desglose por cuota en cobros con excedente o abono parcial. */
  detalle_distribucion?: PagoDistribucionLinea[] | null
  /** Numero SAR asignado al cobro (XXX-XXX-XX-XXXXXXXX). */
  numero_factura?: string | null
  /** Solo en la respuesta de creación si hubo reparto (parcial, excedente, mora). */
  distribucion?: PagoDistribucionLinea[]
}

/** Fila del plan persistido GET /prestamo-cuotas/ */
export interface PrestamoCuotaRow {
  id_cuota: number
  id_prestamo: number
  numero_cuota: number
  fecha_programada: string
  capital_programado: string | number
  interes_programado: string | number
  servicios_programado: string | number
  otros_programado: string | number
  total_programado: string | number
  saldo_capital_programado: string | number
  estado: string
  fecha_pago_real: string | null
}

export interface Servicio {
  id_servicio: number
  id_prestamo: number
  codigo_servicio: number
  nombre_servicio: string
  inicial: string | number
  descuento: string | number
  abono: string | number
  porcentaje: string | number
}

export interface AnularPagoResponse {
  detail: string
  id_pago_maestro: number
  pagos_anulados: number[]
  id_prestamo: number
}

export interface HistorialPagosCobrosFila {
  id_pago: number
  fecha_programada?: string
  fecha_pago: string
  hora_pago?: string
  cobrado_en?: string | null
  registrado_en?: string
  registrado_por?: number | null
  registrado_por_nombre?: string
  registrado_por_etiqueta?: string
  documento: string | null
  capital: string
  interes: string
  total: string
  id_prestamo: number | null
  numero_prestamo: string
  nombre_cliente: string
  dni_cliente: string
  id_cartera?: number | null
  cartera_nombre: string
  cartera_dia_cobro?: string
}

export interface HistorialPagosCobrosResponse {
  modo: string
  fecha_inicio: string
  fecha_fin: string
  generado_en?: string
  cartera_etiqueta: string
  filas: HistorialPagosCobrosFila[]
  resumen: {
    registros: number
    total_capital: string
    total_interes: string
    total_cobrado: string
  }
}

export interface HistorialPrestamo {
  id_historial: number
  id_cliente: number
  numero_prestamo: string
  producto: string | null
  monto: string | number
  interes: string | number
  plazo: number | null
  tasa: string | number | null
  saldo: string | number | null
}

export interface DashboardTotales {
  clientes: number
  prestamos: number
  pagos: number
  historial: number
  usuarios: number
}

export interface DashboardPrestamoFila {
  id_prestamo?: number
  id_historial?: number
  numero_prestamo: string
  id_cliente: number
  cliente_nombre?: string
  producto: string | null
  estado?: string
  monto: string | number
  interes: string | number
  saldo: string | number | null
  fecha_entrega?: string | null
}

export interface DashboardResumen {
  totales: DashboardTotales
  registros_mensuales: {
    labels: string[]
    prestamos: number[]
    pagos: number[]
  }
  prestamos_por_estado: {
    labels: string[]
    valores: number[]
  }
  actividad_semanal: {
    labels: string[]
    cobros: number[]
  }
  tendencia_mensual: {
    labels: string[]
    monto_cobrado: number[]
    monto_desembolsado: number[]
  }
  ultimos_prestamos: DashboardPrestamoFila[]
  historial_prestamos: DashboardPrestamoFila[]
}

export interface AmortizacionItem {
  periodo: number
  cuota: number
  capital: number
  interes: number
  saldo: number
}

export interface SimulacionPrestamo {
  monto: number
  plazo: number
  forma_pago: string
  tasa_interes: number
  tasa_anual: number
  comision: number
  frecuencia_anual: number
  cuota_periodica: number
  total_interes: number
  comision_monto: number
  total_pagar: number
  amortizacion: AmortizacionItem[]
}

export type TipoGestionCobranza = 'llamada' | 'visita' | 'mensaje' | 'acuerdo' | 'judicial'

/** Bitácora de gestiones de cobranza por préstamo. */
export interface GestionCobranza {
  id_gestion: number
  id_prestamo: number
  tipo_gestion: TipoGestionCobranza
  resultado: string
  promesa_pago_fecha: string | null
  promesa_pago_monto: string | number | null
  proxima_accion: string | null
  actor: string
  creado_en: string
}

/** Asignación de zona de ruta por día de semana (0=lunes … 6=domingo). */
export interface UsuarioRutaCobranzaDia {
  id_ruta_dia: number
  id_usuario: number
  id_zona: number
  dia_semana: number
  zona?: Zona | null
}

/** Ruta del cobrador autenticado para el día actual. */
export interface RutaMiHoyResponse {
  dia_semana: number
  id_zona: number | null
  zona: Zona | null
}

/** Configuracion fiscal SAR para facturas de cobro (singleton API). */
export interface ConfiguracionFacturacion {
  id: number
  razon_social: string
  nombre_comercial: string
  rtn: string
  direccion: string
  ciudad: string
  telefono: string
  correo: string
  cai: string
  fecha_limite_emision: string | null
  establecimiento: string
  punto_emision: string
  tipo_documento: string
  correlativo_desde: number
  correlativo_hasta: number
  correlativo_actual: number
  usar_numeracion_sar: boolean
  formato_ticket: '58' | '80'
  aplicar_isv: boolean
  porcentaje_isv: string | number
  leyenda_exento: string
  leyenda_pie: string
  actualizado_en: string | null
  rango_autorizado_texto?: string
  numero_ejemplo?: string
}

/** Bloque de cartera en reporte SAR trimestral. */
export interface ReporteSarCarteraBloque {
  prestamos: number
  saldo: string
}

export interface ReporteSarEncabezado {
  nombre_entidad: string
  rtn: string | null
  trimestre: number
  anio: number
  direccion: string | null
  telefono: string | null
  correo: string | null
}

export interface ReporteSarDetalleOperaciones {
  total_prestamos_otorgados: number
  monto_prestamos_otorgados: string
  tasa_interes_promedio: string
  tasa_interes_minima: string
  tasa_interes_maxima: string
  plazo_promedio: string
  comisiones_desembolsadas: string
}

export interface ReporteSarCarteraVencida extends ReporteSarCarteraBloque {
  por_rango_dias: {
    hasta_30: ReporteSarCarteraBloque
    de_31_a_60: ReporteSarCarteraBloque
    de_61_a_90: ReporteSarCarteraBloque
    mas_de_90: ReporteSarCarteraBloque
  }
}

export interface ReporteSarIngresos {
  intereses_generados: string
  comisiones_cobradas: string
  pagos_recibidos: string
  total_abonos_capital: string
  total_intereses_pagados: string
  total_mora_pagada: string
}

export interface ReporteSarResumen {
  cartera_total_prestamos: number
  cartera_total_saldo: string
  porcentaje_morosidad: string
}

/** GET /reportes/sar/?trimestre=&anio= */
export interface ReporteSarTrimestral {
  trimestre: number
  anio: number
  fecha_inicio: string
  fecha_fin: string
  encabezado: ReporteSarEncabezado
  detalle_operaciones: ReporteSarDetalleOperaciones
  cartera_vigente: ReporteSarCarteraBloque
  cartera_vencida: ReporteSarCarteraVencida
  ingresos: ReporteSarIngresos
  resumen: ReporteSarResumen
  /** @deprecated usar detalle_operaciones */
  total_prestamos_otorgados: number
  /** @deprecated usar detalle_operaciones */
  monto_prestamos_otorgados: string
  /** @deprecated usar ingresos */
  ingresos_intereses: string
  /** @deprecated usar ingresos */
  pagos_recibidos: string
}

export interface FacturasContabilidadFila {
  id_pago: number
  numero_factura: string
  fecha_pago: string
  hora_pago: string
  nombre_cliente: string
  dni_cliente: string
  rtn_cliente: string
  numero_prestamo: string
  cartera_nombre: string
  capital: string
  interes: string
  mora: string
  total: string
  monto_recibido: string
  anulado: boolean
  estado: string
}

/** GET /reportes/facturas-contabilidad/?modo=&fecha=&mes=&anio= */
export interface FacturasContabilidadResponse {
  modo: string
  fecha_inicio: string
  fecha_fin: string
  generado_en?: string
  cartera_etiqueta: string
  incluir_anuladas: boolean
  filas: FacturasContabilidadFila[]
  resumen: {
    registros: number
    total_capital: string
    total_interes: string
    total_mora: string
    total_cobrado: string
  }
}
