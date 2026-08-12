/// <reference types="astro/client" />

type Runtime = { env: { DB: D1Database } };
declare namespace App { interface Locals extends Runtime {} }
