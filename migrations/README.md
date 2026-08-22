# Migraciones

El backend corre con `synchronize: false` en producción (`DB_SYNCHRONIZE` sin
setear o en `false`). El esquema se aplica con estos scripts, en orden.

`synchronize` está apagado a propósito: TypeORM no distingue un renombre de
columna de un borrado más un alta, así que lo resuelve con `DROP` + `ADD` y se
lleva los datos puestos. En una tabla de cuentas eso significa perder los CBU,
que los asigna el Banco Central y no se pueden regenerar.

En local se puede seguir usando la sincronización automática con
`DB_SYNCHRONIZE=true` en el `.env`.

## Orden

| Script | Qué hace |
|---|---|
| `001-rename-accountnumber-to-cbu.sql` | Renombra `accounts.accountNumber` a `cbu` **preservando los valores**, y agrega `accounts.currency`, `users.dni`, `users.birthDate` y `transactions.category`. |
| `002-esquema-modulos-nuevos.sql` | Crea las 14 tablas de tarjetas, préstamos, servicios, recargas, inversiones, seguros y asistente. Recrea las FK de `accounts` y `transactions` con `ON DELETE CASCADE`. |

Los dos son idempotentes en lo que puede repetirse y van dentro de una
transacción: si algo falla, no queda a medias.

## Cómo aplicarlos

### Opción A: con el script (recomendado)

Poné en el `.env` la cadena de conexión, que se saca de Supabase en
**Connect → Transaction pooler**:

```
SUPABASE_DB_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-1-<region>.pooler.supabase.com:6543/postgres
```

Y corré:

```bash
node scripts/aplicar-migraciones.js --dry-run   # diagnostica, no escribe
node scripts/aplicar-migraciones.js             # aplica
```

El script aplica los scripts en orden, verifica el resultado y **nunca imprime
la contraseña**. Es reejecutable: si un deploy queda a medias, se vuelve a
correr sin problema.

Usá el host del **pooler**, no `db.<ref>.supabase.co`: ese es IPv6-only y
Render en plan free no tiene salida IPv6.

### Opción B: a mano en Supabase

1. Dashboard → **SQL Editor**.
2. Pegar el contenido de `001`, **Run**. Revisar que la verificación del final
   devuelva las cuentas con su `cbu` intacto.
3. Pegar el contenido de `002`, **Run**. La verificación tiene que devolver 14.
4. Recién ahí desplegar el backend.

## Cómo se generó la 002

No está escrita a mano. Se levantó una base con el esquema viejo de producción,
se le aplicó la `001`, y se le pidió a TypeORM el SQL que le faltaba correr:

```js
const sqls = await dataSource.driver.createSchemaBuilder().log();
```

Después se verificó al revés: aplicando `001` + `002` sobre el esquema viejo,
TypeORM reporta **0 sentencias pendientes**, o sea que el esquema queda
exactamente como lo esperan las entidades.

## Al agregar o cambiar una entidad

1. Desarrollar en local con `DB_SYNCHRONIZE=true`.
2. Generar el SQL con el mismo `.log()` de arriba, contra una copia del esquema
   de producción.
3. Guardarlo como `00N-descripcion.sql` y **leerlo**: si aparece un
   `DROP COLUMN` que en realidad es un renombre, reemplazarlo por
   `ALTER TABLE ... RENAME COLUMN`.
4. Aplicarlo antes de desplegar.
