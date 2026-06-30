# Backend Pulsera PPG (Node.js + Express + PostgreSQL)

API REST que recibe las sesiones clínicas de la app Flutter (pulsera PPG) y las
guarda en PostgreSQL. Reemplaza el envío anterior a Firebase. Incluye un
dashboard web base (`public/`) para que lo termines tú.

## Arquitectura (según GUIA_VPS.md)

```
App Flutter ──HTTPS POST──► nginx_proxy ──► pulsera_api (Docker :9000)
                                                 │ red postgresql_default
                                                 ▼
                                            postgres_db → BD "pulsera_db"
```

- El puerto 5432 del VPS **solo escucha en 127.0.0.1**: la app NUNCA conecta
  directo a PostgreSQL. Habla con este API por HTTPS.
- El API alcanza la BD por DNS interno `postgres_db` (red `postgresql_default`).

## Modelo de datos (relacional)

```
doctor(id, name, lastname, username·unique, password_hash bcrypt, created_at)
patient(id, code·unique, age, gender, created_at)
bracelet(id, code·unique, type, created_at)
consultation(id, patient_id→, doctor_id→, bracelet_id→, started_at, ended_at, notes)
record(id, consultation_id→, captured_at, ppg, bpm_raw, source, device_time, phase, status)
   phase  ∈ {m1..m6}  (momento de la consulta)
   status ∈ {a1..a5}  (estado/ansiedad del paciente)
vista consultation_summary -> duration, duration_seconds, num_records
```

Flujo: `login doctor` → `crea/elige patient + bracelet` → `POST consultation` (inicia)
→ cada "Guardar" del odontólogo = `POST record` (con phase + status) → `PATCH .../end`
(termina y permite calcular duración).

## Endpoints

| Método | Ruta                              | Auth      | Descripción                          |
|--------|-----------------------------------|-----------|--------------------------------------|
| GET    | `/health`                         | público   | Estado del servicio y la BD          |
| POST   | `/api/doctors`                    | X-API-Key | Registrar odontólogo                 |
| POST   | `/api/doctors/login`              | X-API-Key | Login (username + password)          |
| GET    | `/api/doctors`                    | X-API-Key | Listar odontólogos                   |
| POST   | `/api/patients`                   | X-API-Key | Registrar paciente                   |
| GET    | `/api/patients`                   | X-API-Key | Listar pacientes                     |
| POST   | `/api/bracelets`                  | X-API-Key | Registrar pulsera                    |
| GET    | `/api/bracelets`                  | X-API-Key | Listar pulseras                      |
| POST   | `/api/consultations`              | X-API-Key | Iniciar consulta                     |
| PATCH  | `/api/consultations/:id/end`      | X-API-Key | Terminar consulta                    |
| GET    | `/api/consultations`              | X-API-Key | Listado con duración + nº records    |
| GET    | `/api/consultations/:id`          | X-API-Key | Detalle con sus records              |
| POST   | `/api/records`                    | X-API-Key | Guardar momento clave                |
| GET    | `/api/records?consultation_id=NN` | X-API-Key | Records de una consulta              |
| GET    | `/`                               | público   | Dashboard web estático               |

### Ejemplo: POST /api/records
```json
{
  "consultation_id": 1,
  "ppg": 78,
  "bpm_raw": "14:32:07,78,OK",
  "source": "OK",
  "device_time": "14:32:07",
  "phase": "m1",
  "status": "a3"
}
```

## Variables de entorno (`.env`, nunca a git)
Ver `.env.example`. Claves:
- `DATABASE_URL=postgresql://admin:K4qu1_Pr0d_2026@postgres_db:5432/pulsera_db`
- `API_KEY=<openssl rand -hex 24>`  (la app la envía en `X-API-Key`)

## Despliegue en el VPS (resumen)

```bash
# 1) Subir esta carpeta al VPS (ej. ~/pulsera_backend) y crear .env
ssh kaqui@161.132.54.226
mkdir -p ~/pulsera_backend            # copiar aquí el contenido
cp .env.example .env && nano .env     # poner API_KEY real

# 2) Crear la base de datos (si no existe)
docker exec postgres_db psql -U admin -d main_db -c "CREATE DATABASE pulsera_db;"

# 3) Levantar el contenedor
cd ~/pulsera_backend
docker compose up -d --build

# 4) Verificar local
curl -s http://localhost:9000/health     # -> {"status":"ok","db":"up"}

# 5) Subdominio HTTPS (DNS pulsera.lucyscan.com -> 161.132.54.226 ya creado)
sudo kaqui-sites add pulsera pulsera.lucyscan.com 9000 origin
curl -I https://pulsera.lucyscan.com/health
```

> El esquema (`sql/schema.sql`) se aplica solo al arrancar el contenedor (idempotente).

### ⚠️ Bug docker-snap al re-desplegar (ver GUIA_VPS.md)
`docker compose up -d --build` puede fallar al recrear con
`cannot stop container ... permission denied` (AppArmor + snap). Workaround:
```bash
cd ~/pulsera_backend && docker compose build
docker update --restart=no pulsera_api
echo <SUDO_PASS> | sudo -S kill -9 $(docker inspect --format '{{.State.Pid}}' pulsera_api)
echo <SUDO_PASS> | sudo -S docker rm pulsera_api
docker compose up -d
docker rename <hash>_pulsera_api pulsera_api   # si quedó con prefijo
docker update --restart=always pulsera_api
```
