ViteEnvManager (0.1.0-beta.1 )
A secure, type-safe, and transformer-ready environment manager for Vite-based applications like Remix.

🚀 Key Benefits
✅ Single Source of Truth: Centralized environment variable access.

✅ Type Safety: Full TypeScript inference with autocompletion.

✅ Validation: Runtime checking with sensible fallbacks.

✅ Separation of Concerns: Clear boundary between server/client variables.

✅ Secure by Default: Only VITE_ variables are exposed to client.

✅ Hot Reload Support: Refresh env at runtime using reloadEnv().

✅ Zero Dependencies: No need for dotenv; leverages Vite’s native handling.

🔧 How It Works
ViteEnvManager loads variables from .env files using Vite’s load order:

bash
Copy
Edit
.env.[mode].local > .env.[mode] > .env.local > .env
It applies:

Defaults (for dev/local)

Transformers (to convert strings into booleans, numbers, arrays, etc.)

Validators (to enforce type/length/enum rules)

📁 Schema Definition
ts
Copy
Edit
export type EnvSchema = {
  SERVER_SECRET: string;
  DATABASE_URL: string;
  TIMEZONE: string;
  LOCALE: string;
  KARTOS_BASE_URL: string;

  VITE_PUBLIC_API_URL: string;
  VITE_PUBLIC_ENV: 'development' | 'production' | 'test';

  VITE_DEBUG_MODE?: boolean;
  VITE_LOCALE?: string;
};
🌱 Defaults (Development-Safe)
Defined in src/core/env.ts:

ts
Copy
Edit
const defaults: EnvSchema = {
  SERVER_SECRET: 'default-secret', // Warning: NOT for production
  DATABASE_URL: 'postgres://localhost:5432/mydb',
  VITE_PUBLIC_API_URL: 'http://localhost:3000/api',
  VITE_PUBLIC_ENV: 'development',
  VITE_DEBUG_MODE: false,
  VITE_LOCALE: 'en-US',
  TIMEZONE: 'America/Mexico_Citys',
  LOCALE: 'es-MX',
  KARTOS_BASE_URL: 'http://localhost:3000',
};
🧪 Validators
Enforce runtime correctness:

ts
Copy
Edit
const validators = {
  SERVER_SECRET: (v) => typeof v === 'string' && v.length >= 32,
  DATABASE_URL: (v) => typeof v === 'string' && v.length > 0,
  VITE_PUBLIC_ENV: (v) => ['development', 'production', 'test'].includes(v),
  VITE_DEBUG_MODE: (v) => typeof v === 'boolean',
  VITE_LOCALE: (v) => /^[a-z]{2}-[A-Z]{2}$/.test(v),
  TIMEZONE: (v) => typeof v === 'string',
  LOCALE: (v) => typeof v === 'string',
  KARTOS_BASE_URL: (v) => typeof v === 'string',
};
🔄 Transformers
Cast env values to correct types:

ts
Copy
Edit
const transformers = {
  VITE_DEBUG_MODE: (v) => v === 'true',
  VITE_PUBLIC_ENV: (v) => v.toLowerCase() as 'development' | 'production' | 'test',
};
Add more as needed:

ts
Copy
Edit
VITE_PORT: (v) => parseInt(v, 10),
VITE_ALLOWED_ORIGINS: (v) => v.split(','),
🔂 Lifecycle
Load defaults

Override with .env values

Apply transformers

Run validations

Invalid or missing values fallback to defaults, with warnings in console.

👨‍💻 Usage
Server-Side (Remix loaders, actions):
ts
Copy
Edit
import { env } from '~/core/env.server';

export const loader = async () => {
  const secret = env.SERVER_SECRET; // type-safe, validated
  return json({ env: env.VITE_PUBLIC_ENV });
};
Client-Side (only VITE_ prefixed):
ts
Copy
Edit
import { env } from '~/core/env.client';

console.log(env.VITE_PUBLIC_API_URL); // Available
console.log(env.SERVER_SECRET); // ❌ Not exposed
🧪 Test Mocks
ts
Copy
Edit
import { setEnv } from '~/core/env';

beforeEach(() => {
  setEnv('VITE_DEBUG_MODE', true); // mock override
});
🔄 Hot Reload
ts
Copy
Edit
import { reloadEnv } from '~/core/env';

reloadEnv(); // Useful in dev tools or after dynamic config changes
🧼 Best Practices
Use defaults only for local dev — not production.

Store secrets in .env.local, not committed.

Validate every schema field.

Add a transformer if value type ≠ string.

Never use process.env or import.meta.env directly — always go through env.

🧪 What If a Variable Is Not in the Schema?
env
Copy
Edit
# In .env
UNDECLARED_VAR=somevalue
Behavior:

Ignored by loader

Not available via env.UNDECLARED_VAR

Causes TypeScript error if accessed

Won’t be validated or transformed

➕ Adding New Variables
Add to schema:

ts
Copy
Edit
NEW_VARIABLE: string;
Add to defaults:

ts
Copy
Edit
NEW_VARIABLE: 'some-default',
(Optional) Add transformer:

ts
Copy
Edit
NEW_VARIABLE: (v) => JSON.parse(v),
(Optional) Add validator:

ts
Copy
Edit
NEW_VARIABLE: (v) => v !== '',
Done! It will now be automatically type-safe, validated, and loaded.

🛡️ Security Tips
Rule	Why
Only VITE_ vars are public	Vite exposes them to the browser
Never commit secrets	Keep secrets in .env.local
Validate all vars	Avoid typos and undefined usage
Use schema typing	Prevent access to undefined keys

📦 Example .env
env
Copy
Edit
# Client-side (public)
VITE_PUBLIC_API_URL=http://localhost:3000/api
VITE_PUBLIC_ENV=development
VITE_DEBUG_MODE=true
VITE_LOCALE=en-US

# Server-side only
SERVER_SECRET=super-secure-secret-1234567890123456
DATABASE_URL=postgres://localhost/mydb
TIMEZONE=America/Mexico_Citys
LOCALE=es-MX
KARTOS_BASE_URL=http://localhost:3000
📁 File Structure Suggestion
arduino
Copy
Edit
src/
├── core/
│   ├── env.ts             # ViteEnvManager class
│   ├── env.server.ts      # Server-only export
│   └── env.client.ts      # Filtered client-safe export
