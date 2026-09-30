-- ═══════════════════════════════════════════════════════════════════════
-- 001 · Enlaces de convenio con token de un solo uso
-- ═══════════════════════════════════════════════════════════════════════
--
-- Sustituye al enlace abierto `/convenio/ENT-01?importe=5000`, que era
-- reutilizable sin límite y cuyos campos "fijados por la Fundación" se podían
-- editar desde la barra de direcciones. Con token: un uso, caducidad, y los
-- fijados se leen de aquí (columna `fijados`), no de la URL.
--
-- Se aplica con:  pnpm db:migrar
-- Es idempotente: se puede volver a lanzar sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists enlaces_convenio (
  token      text primary key,                     -- aleatorio, inadivinable (24 bytes base64url)
  codigo     text not null,                        -- plantilla, ej. 'ENT-01'
  fijados    jsonb not null default '{}'::jsonb,   -- importe, proyecto… ya no viajan en la URL
  nota       text,                                 -- "Bimbo · Ana Ruiz", para reconocerlo en la lista
  estado     text not null default 'pendiente'
             check (estado in ('pendiente', 'usado', 'anulado')),
  creado_en  timestamptz not null default now(),
  caduca_en  timestamptz not null,
  usado_en   timestamptz,
  usado_por  text                                  -- entidad que acabó enviándolo
);

-- Para la pantalla de seguimiento (/convenios/enlaces), que ordena y filtra por estado.
create index if not exists enlaces_convenio_estado_caduca_idx
  on enlaces_convenio (estado, caduca_en);

-- OJO: 'caducado' NO es un estado almacenado. Se deriva de `caduca_en < now()`.
-- Si fuera una columna habría que pasar un proceso cada noche a cambiarla, y entre
-- pasada y pasada la tabla mentiría. Calculado al leer siempre dice la verdad.
