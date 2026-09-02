/**
 * Plata Clara — servicio de notificaciones push
 * ---------------------------------------------------------------------------
 * Este archivo va completo, tal cual, en un Cloudflare Worker (gratis, sin
 * necesidad de dominio propio ni instalar nada en tu computador).
 *
 * Incluye, empaquetado adentro, el motor de envío de Web Push de la librería
 * @mmmike/web-push (RFC 8291 + RFC 8292, MIT license — https://github.com/MMMikeM/web-push)
 * para no depender de instalar paquetes de npm dentro del editor de Cloudflare.
 *
 * CÓMO INSTALARLO (una sola vez):
 *  1. Ve a https://dash.cloudflare.com → Workers & Pages → Create application
 *     → pestaña "Workers" → "Create Worker" (dale un nombre, ej. plata-clara-push).
 *  2. Te abre el editor — borra todo y pega este archivo completo. Deploy.
 *  3. Ve a tu Worker recién creado → Settings → Variables and Secrets → agrega
 *     estas 5 (todas como "secret" salvo que digan lo contrario):
 *       SUPABASE_URL           = https://wuxdctmhbuttzssiknkt.supabase.co
 *       SUPABASE_ANON_KEY      = (el mismo anon key que ya usa la app)
 *       VAPID_PUBLIC_KEY       = (te lo doy yo, ver mensaje aparte)
 *       VAPID_PRIVATE_KEY      = (te lo doy yo, ver mensaje aparte — trátalo con cuidado)
 *       VAPID_SUBJECT          = mailto:tu-correo@gmail.com  (pon tu correo real)
 *  4. Copia la URL del Worker (algo como https://plata-clara-push.tu-cuenta.workers.dev)
 *     — la vas a necesitar en dos lugares: en tu Apps Script (variable
 *     PUSH_WORKER_URL) y no hace falta ponerla en ningún otro lado.
 *
 * Qué expone: un solo endpoint, POST /notify — lo llama tu Apps Script cada vez
 * que importa transacciones nuevas, y este Worker les manda la notificación a
 * todos los dispositivos suscritos de tu hogar. No expone nada más útil para
 * quien no tenga el código de tu hogar (se valida contra Supabase en cada llamada).
 */

//#region src/vapid.ts
/**
* VAPID — Voluntary Application Server Identification (RFC 8292). The ECDSA
* P-256 key pair and signed JWT that identify an application server to a push
* service, so it will accept pushes for its subscriptions.
*/
/**
* Convert a URL-safe base64 string to a Uint8Array.
*/
const urlBase64ToUint8Array = (base64String) => {
	if (!base64String) return /* @__PURE__ */ new Uint8Array(0);
	const base64 = (base64String + "=".repeat((4 - base64String.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
	return outputArray;
};
/**
* Convert a Uint8Array to a URL-safe base64 string (no padding).
*/
const uint8ArrayToUrlBase64 = (array) => {
	let binary = "";
	const chunkSize = 32768;
	for (let i = 0; i < array.length; i += chunkSize) binary += String.fromCharCode(...array.subarray(i, i + chunkSize));
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
/**
* Generate a new VAPID key pair using ECDSA P-256.
* Returns keys as URL-safe base64 strings.
*
* @example
* ```ts
* const { publicKey, privateKey } = await generateVapidKeys();
* console.log({ publicKey, privateKey });
* ```
*/
const generateVapidKeys = async () => {
	const keyPair = await crypto.subtle.generateKey({
		name: "ECDSA",
		namedCurve: "P-256"
	}, true, ["sign", "verify"]);
	const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
	const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
	if (!privateKeyJwk.d) throw new Error("Generated P-256 key exported without a private scalar");
	return {
		publicKey: uint8ArrayToUrlBase64(new Uint8Array(publicKeyRaw)),
		privateKey: uint8ArrayToUrlBase64(urlBase64ToUint8Array(privateKeyJwk.d))
	};
};
const encodeJwtSegment = (segment) => uint8ArrayToUrlBase64(new TextEncoder().encode(JSON.stringify(segment)));
/**
* Rebuild the ECDSA signing key from the raw VAPID key pair. Web Crypto has no
* "raw" import for private keys, so the P-256 point is split into the JWK
* coordinates it does accept.
*
* @throws {Error} if either key is the wrong length or encoding.
*/
const importSigningKey = (publicKey, privateKey) => {
	const publicKeyArray = urlBase64ToUint8Array(publicKey);
	const privateKeyArray = urlBase64ToUint8Array(privateKey);
	if (publicKeyArray.length !== 65 || publicKeyArray[0] !== 4) throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point");
	if (privateKeyArray.length !== 32) throw new Error("VAPID private key must be a 32-byte P-256 scalar");
	const jwk = {
		kty: "EC",
		crv: "P-256",
		x: uint8ArrayToUrlBase64(publicKeyArray.slice(1, 33)),
		y: uint8ArrayToUrlBase64(publicKeyArray.slice(33)),
		d: uint8ArrayToUrlBase64(privateKeyArray)
	};
	return crypto.subtle.importKey("jwk", jwk, {
		name: "ECDSA",
		namedCurve: "P-256"
	}, false, ["sign"]);
};
/**
* Create a VAPID JWT for authenticating with push services.
*
* @throws {Error} if the expiration is outside 1–86400 seconds, the subject is
* not a `mailto:`/`https://` URI, or either key is malformed.
*/
const createVapidJwt = async (options) => {
	const { audience, subject, publicKey, privateKey, expiration = 43200 } = options;
	if (expiration <= 0 || expiration > 86400) throw new Error("VAPID JWT expiration must be between 1 and 86400 seconds (24 hours)");
	if (!/^(mailto:|https:\/\/)/.test(subject)) throw new Error("VAPID subject must be a 'mailto:' or 'https://' URI");
	const unsignedToken = [{
		typ: "JWT",
		alg: "ES256"
	}, {
		aud: audience,
		exp: Math.floor(Date.now() / 1e3) + expiration,
		sub: subject
	}].map(encodeJwtSegment).join(".");
	const signingKey = await importSigningKey(publicKey, privateKey);
	const signature = await crypto.subtle.sign({
		name: "ECDSA",
		hash: "SHA-256"
	}, signingKey, new TextEncoder().encode(unsignedToken));
	return `${unsignedToken}.${uint8ArrayToUrlBase64(new Uint8Array(signature))}`;
};
//#endregion

//#region src/encrypt.ts
/**
* aes128gcm content encryption for Web Push (RFC 8291 / RFC 8188).
*
* Split out from the HTTP/VAPID orchestration in `send.ts` so the encryption
* core can be unit-tested in isolation. This module is deliberately NOT a
* package entry point (see the `exports` map in package.json): `encryptRecord`
* is reachable only from inside the bundle and from tests that import `src/`
* directly — never by consumers of the published package.
*/
const SALT_LENGTH = 16;
const KEY_ID_LENGTH = 65;
const PADDING_DELIMITER = 2;
const UNCOMPRESSED_POINT_TAG = 4;
/** aes128gcm content-coding header length, 86 octets (RFC 8188 §2.1). */
const HEADER_LENGTH = 86;
/**
* Record size advertised in the header. Also the ceiling a push service is
* required to accept for the *whole* request body (RFC 8291 §4 / RFC 8030 §7.2).
*/
const RECORD_SIZE = 4096;
/**
* Largest plaintext that fits in a single record without pushing the request
* body past {@link RECORD_SIZE}: the body is the header plus the encrypted
* record (plaintext + padding delimiter + GCM tag). 3993 octets (RFC 8291 §4).
*/
const MAX_PAYLOAD_BYTES = 3993;
const encoder = new TextEncoder();
/**
* Split from {@link validatePushInputs} so a batch send can reject an
* oversized payload once, up front, rather than once per subscription.
*
* @throws {Error} if the payload exceeds the single-record limit.
*/
const assertPayloadWithinLimit = (payload) => {
	if (payload.length > MAX_PAYLOAD_BYTES) throw new Error(`Payload too large: ${payload.length} bytes exceeds the ${MAX_PAYLOAD_BYTES}-byte single-record limit`);
};
const concat = (...parts) => {
	const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
};
/**
* Validate the payload size and the subscription's public key and auth secret,
* returning the decoded key bytes. Exported so the send path can reject invalid
* input *before* paying for the ECDSA VAPID signature (see `send.ts`). The
* encryption core re-checks as a self-contained guard for direct callers.
*
* @throws {Error} if the payload exceeds the single-record limit, or either
* subscription key is malformed.
*/
const validatePushInputs = (payload, p256dhKey, authSecret) => {
	assertPayloadWithinLimit(payload);
	const clientPublicKeyBytes = urlBase64ToUint8Array(p256dhKey);
	if (clientPublicKeyBytes.length !== KEY_ID_LENGTH || clientPublicKeyBytes[0] !== UNCOMPRESSED_POINT_TAG) throw new Error("Invalid subscription p256dh key: expected a 65-byte uncompressed P-256 public key");
	const authSecretBytes = urlBase64ToUint8Array(authSecret);
	if (authSecretBytes.length < 16) throw new Error("Invalid subscription auth secret: expected at least 16 bytes");
	return {
		clientPublicKeyBytes,
		authSecretBytes
	};
};
const importClientPublicKey = (rawKey) => crypto.subtle.importKey("raw", rawKey, {
	name: "ECDH",
	namedCurve: "P-256"
}, false, []);
const deriveSharedSecret = async (serverPrivateKey, clientPublicKey) => new Uint8Array(await crypto.subtle.deriveBits({
	name: "ECDH",
	public: clientPublicKey
}, serverPrivateKey, 256));
const exportRawPublicKey = async (key) => new Uint8Array(await crypto.subtle.exportKey("raw", key));
const importHkdfKey = (bytes) => crypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveBits", "deriveKey"]);
/** `label || 0x00 || context`, the HKDF info construction of RFC 8291 §3.4. */
const hkdfInfo = (label, ...context) => concat(encoder.encode(label), new Uint8Array([0]), ...context);
/** PRK = HKDF(salt = auth_secret, IKM = ECDH shared secret) — RFC 8291 §3.4. */
const deriveInputKeyingMaterial = async (sharedSecret, authSecret, clientPublicKey, serverPublicKey) => new Uint8Array(await crypto.subtle.deriveBits({
	name: "HKDF",
	hash: "SHA-256",
	salt: authSecret,
	info: hkdfInfo("WebPush: info", clientPublicKey, serverPublicKey)
}, await importHkdfKey(sharedSecret), 256));
const deriveContentEncryptionKey = (ikmKey, salt) => crypto.subtle.deriveKey({
	name: "HKDF",
	hash: "SHA-256",
	salt,
	info: hkdfInfo("Content-Encoding: aes128gcm")
}, ikmKey, {
	name: "AES-GCM",
	length: 128
}, false, ["encrypt"]);
const deriveNonce = async (ikmKey, salt) => new Uint8Array(await crypto.subtle.deriveBits({
	name: "HKDF",
	hash: "SHA-256",
	salt,
	info: hkdfInfo("Content-Encoding: nonce")
}, ikmKey, 96));
const padPayload = (payload) => concat(payload, new Uint8Array([PADDING_DELIMITER]));
/** `salt | rs | idlen | keyid`, where keyid is the server's ephemeral public key. */
const contentCodingHeader = (salt, keyId) => {
	const header = new Uint8Array(HEADER_LENGTH);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(SALT_LENGTH, RECORD_SIZE, false);
	header[20] = KEY_ID_LENGTH;
	header.set(keyId, 21);
	return header;
};
/**
* Encrypt a payload as a single aes128gcm record (RFC 8291 / RFC 8188),
* generating a fresh ephemeral key pair and salt for this message.
*
* @throws {Error} if the payload is too large or the subscription keys are
* malformed (see {@link validatePushInputs}).
*/
const encryptPayload = async (payload, p256dhKey, authSecret) => {
	const serverKeyPair = await crypto.subtle.generateKey({
		name: "ECDH",
		namedCurve: "P-256"
	}, true, ["deriveBits"]);
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
	return encryptRecord(payload, p256dhKey, authSecret, serverKeyPair, salt);
};
/**
* Deterministic core of {@link encryptPayload}: the caller supplies the
* ephemeral server key pair and salt (normally random, one per message).
*
* @internal Not part of the public API — exposed only so the RFC 8291
* Appendix A known-answer test can pin the output. Never call this in
* production: a fresh key pair and salt per message is what keeps the scheme
* safe.
*/
const encryptRecord = async (payload, p256dhKey, authSecret, serverKeyPair, salt) => {
	const { clientPublicKeyBytes, authSecretBytes } = validatePushInputs(payload, p256dhKey, authSecret);
	const clientPublicKey = await importClientPublicKey(clientPublicKeyBytes);
	const sharedSecret = await deriveSharedSecret(serverKeyPair.privateKey, clientPublicKey);
	const serverPublicKey = await exportRawPublicKey(serverKeyPair.publicKey);
	const ikm = await deriveInputKeyingMaterial(sharedSecret, authSecretBytes, clientPublicKeyBytes, serverPublicKey);
	const ikmKey = await importHkdfKey(ikm);
	const contentEncryptionKey = await deriveContentEncryptionKey(ikmKey, salt);
	const nonce = await deriveNonce(ikmKey, salt);
	const ciphertext = await crypto.subtle.encrypt({
		name: "AES-GCM",
		iv: nonce
	}, contentEncryptionKey, padPayload(payload));
	return concat(contentCodingHeader(salt, serverPublicKey), new Uint8Array(ciphertext));
};
//#endregion
//#region src/send.ts
/**
* The HTTP half of a push: VAPID auth (RFC 8292) over an aes128gcm-encrypted
* body (RFC 8291), plus the status handling that decides delivered / gone / error.
*/
/** RFC 9110 §10.2.3: `Retry-After` is either delta-seconds or an HTTP-date. */
const parseRetryAfterMs = (retryAfter) => {
	if (retryAfter === null) return null;
	const trimmed = retryAfter.trim();
	if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1e3;
	const date = Date.parse(trimmed);
	return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
};
/**
* Error thrown when the push service rejects a send with a non-2xx status,
* other than 404/410 ("gone"), which resolve to `false` instead. Carries the
* status, response body, endpoint, and the `Retry-After` header both verbatim
* (`retryAfter`) and parsed to milliseconds-from-now (`retryAfterMs`).
*/
var WebPushError = class extends Error {
	statusCode;
	body;
	/**
	* The full subscription endpoint, a capability URL: anyone holding it can
	* push to the device. Route on it, but keep it out of logs; serializers
	* that honor `toJSON` get a truncated one.
	*/
	endpoint;
	/** The `Retry-After` header verbatim: delta-seconds or an HTTP-date */
	retryAfter;
	/** `Retry-After` as milliseconds from now; `null` when absent or unparseable */
	retryAfterMs;
	constructor(message, statusCode, body, endpoint, retryAfter = null) {
		super(message);
		this.name = "WebPushError";
		this.statusCode = statusCode;
		this.body = body;
		this.endpoint = endpoint;
		this.retryAfter = retryAfter;
		this.retryAfterMs = parseRetryAfterMs(retryAfter);
	}
	/**
	* Truncates `endpoint` and `body` for serialization. Without this,
	* `JSON.stringify` on the error would emit every enumerable field,
	* persisting the full capability URL into any structured log.
	*/
	toJSON() {
		return {
			name: this.name,
			message: this.message,
			statusCode: this.statusCode,
			endpoint: this.endpoint.slice(0, 50),
			body: this.body.slice(0, 200),
			retryAfter: this.retryAfter,
			retryAfterMs: this.retryAfterMs
		};
	}
};
var RawBytes = class {
	#bytes;
	constructor(bytes) {
		this.#bytes = bytes;
	}
	get bytes() {
		return this.#bytes;
	}
};
/**
* Mark a payload as already serialized: the string or bytes are encrypted and
* delivered verbatim, so your service worker's parsing is the other half of
* the contract. The README service worker expects `PushPayload` JSON and will
* throw on anything else — which is also why the send functions take this
* wrapper rather than a bare string: a misdirected string would type-check,
* deliver, and only fail inside `event.data.json()` on the device.
*/
const rawPayload = (payload) => new RawBytes(typeof payload === "string" ? new TextEncoder().encode(payload) : payload);
const encodePayload = (payload) => payload instanceof RawBytes ? payload.bytes : new TextEncoder().encode(JSON.stringify(payload));
/**
* Derive a valid `topic` from an arbitrary string, for collapse keys that
* don't fit the RFC 8030 §5.4 charset or length (`message:${id}`, a URL, …).
* Deterministic — the same input always yields the same topic, which is what
* makes push-service collapse work — and opaque, so the key's content never
* appears in a header the push service can read (only the payload is
* encrypted; headers are plaintext to the service). The first 32 base64url
* characters of a SHA-256 digest carry 192 bits, leaving collisions
* negligible.
*
* Strings that are already valid topics are hashed too, never passed through:
* a conditional pass-through would make near-identical inputs produce
* unrelated wire values. Set {@link SendPushOptions.topic} directly when you
* need an exact header value.
*/
const topicFromString = async (input) => {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
	return uint8ArrayToUrlBase64(new Uint8Array(digest)).slice(0, 32);
};
/** RFC 8030 §5.4: a collapse key of at most 32 URL-safe base64 characters. */
const assertValidTopic = (topic) => {
	if (topic !== void 0 && !/^[A-Za-z0-9\-_]{1,32}$/.test(topic)) throw new Error("Topic must be 1-32 URL-safe base64 characters");
};
/** The JWT `aud` claim is the push service origin, not the full endpoint. */
const pushServiceOrigin = (endpoint) => {
	const url = new URL(endpoint);
	if (url.protocol !== "https:") throw new Error("Invalid subscription endpoint: must be an https: URL (RFC 8030 §3)");
	return `${url.protocol}//${url.host}`;
};
/** 404 Not Found and 410 Gone both mean the subscription should be deleted. */
const isSubscriptionGone = (status) => status === 404 || status === 410;
const DEFAULT_TIMEOUT_MS = 3e4;
const assertValidTimeout = (timeoutMs) => {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be a positive number of milliseconds");
};
const requestSignal = (signal, timeoutMs) => signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
const buildPushHeaders = ({ jwt, vapidPublicKey, ttl, urgency, topic }) => {
	const headers = {
		Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
		"Content-Encoding": "aes128gcm",
		"Content-Type": "application/octet-stream",
		TTL: String(ttl)
	};
	if (urgency) headers.Urgency = urgency;
	if (topic) headers.Topic = topic;
	return headers;
};
const postToPushService = async (subscription, payloadBytes, jwt, vapidPublicKey, options) => {
	const { logger, ttl = 86400, urgency, topic, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
	const encryptedPayload = await encryptPayload(payloadBytes, subscription.keys.p256dh, subscription.keys.auth);
	const response = await fetch(subscription.endpoint, {
		method: "POST",
		headers: buildPushHeaders({
			jwt,
			vapidPublicKey,
			ttl,
			urgency,
			topic
		}),
		body: encryptedPayload,
		signal: requestSignal(signal, timeoutMs)
	});
	const responseText = await response.text();
	logger?.debug?.("Push response", {
		endpoint: subscription.endpoint.slice(0, 50),
		status: response.status,
		statusText: response.statusText,
		body: responseText.slice(0, 200)
	});
	if (response.ok) return true;
	if (isSubscriptionGone(response.status)) return false;
	throw new WebPushError(response.status === 429 ? `Push rate limit exceeded: ${response.statusText}` : `Push service error: ${response.status} ${response.statusText}`, response.status, responseText, subscription.endpoint, response.headers.get("retry-after"));
};
/**
* Send a push notification to a subscription endpoint.
*
* Each request carries a timeout (default 30s) and, when provided, the
* caller's `signal`; hitting either rejects with the abort reason.
*
* @param payload A `PushPayload` is JSON-serialized; a {@link rawPayload}
* wrapper is encrypted and sent verbatim
* @returns true if successful, false if subscription is invalid (should be deleted)
* @throws {WebPushError} on rate limits (429) and other push service errors
* @throws {Error} on invalid input: VAPID config, payload size, `topic`,
* `timeoutMs`, or a non-`https:` endpoint
* @example
* ```ts
* const delivered = await sendPushNotification(subscription, payload, vapid);
* if (!delivered) await removeFromStore(subscription.endpoint);
* ```
*/
const sendPushNotification = async (subscription, payload, vapid, options = {}) => {
	assertValidTopic(options.topic);
	assertValidTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const payloadBytes = encodePayload(payload);
	validatePushInputs(payloadBytes, subscription.keys.p256dh, subscription.keys.auth);
	const jwt = await createVapidJwt({
		audience: pushServiceOrigin(subscription.endpoint),
		subject: vapid.subject,
		publicKey: vapid.publicKey,
		privateKey: vapid.privateKey,
		expiration: options.vapidExpiration ?? 43200
	});
	return postToPushService(subscription, payloadBytes, jwt, vapid.publicKey, options);
};
/**
* Send one notification to every subscription through a bounded worker pool.
*
* Per-subscription failures never reject the batch: `delivered` counts the
* sends the push service accepted, endpoints it reported gone (404/410) come
* back in `gone` for deletion, and every other failed send comes back in
* `failed` with its error. One VAPID JWT is signed per push-service origin
* rather than per message, since the token is scoped to the origin and valid
* for the whole batch. Aborting `options.signal` stops workers from starting
* new sends; subscriptions never attempted count toward none of the three.
*
* @param payload A `PushPayload` is JSON-serialized; a {@link rawPayload}
* wrapper is encrypted and sent verbatim
* @throws {Error} on caller input — invalid VAPID config, oversized payload,
* invalid `topic`, `concurrency`, or `timeoutMs` — before anything is sent.
* A non-`https:` endpoint is per-subscription data and lands in `failed`.
* @example
* ```ts
* const { delivered, gone, failed } = await sendPushBatch(subscriptions, payload, vapid);
* await removeFromStore(gone);
* for (const { endpoint, error } of failed) console.warn("push failed", endpoint, error);
* ```
*/
const sendPushBatch = async (subscriptions, payload, vapid, options = {}) => {
	const { concurrency = 100, ...sendOptions } = options;
	if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("concurrency must be a positive integer");
	assertValidTopic(sendOptions.topic);
	assertValidTimeout(sendOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const payloadBytes = encodePayload(payload);
	assertPayloadWithinLimit(payloadBytes);
	const vapidJwtFor = (audience) => createVapidJwt({
		audience,
		subject: vapid.subject,
		publicKey: vapid.publicKey,
		privateKey: vapid.privateKey,
		expiration: sendOptions.vapidExpiration ?? 43200
	});
	await vapidJwtFor("https://push.invalid");
	const jwtByOrigin = /* @__PURE__ */ new Map();
	const cachedJwtFor = (origin) => {
		const cached = jwtByOrigin.get(origin);
		if (cached) return cached;
		const jwt = vapidJwtFor(origin);
		jwtByOrigin.set(origin, jwt);
		return jwt;
	};
	let delivered = 0;
	const gone = [];
	const failed = [];
	const sendOne = async (subscription) => {
		try {
			validatePushInputs(payloadBytes, subscription.keys.p256dh, subscription.keys.auth);
			const jwt = await cachedJwtFor(pushServiceOrigin(subscription.endpoint));
			if (await postToPushService(subscription, payloadBytes, jwt, vapid.publicKey, sendOptions)) delivered += 1;
			else gone.push(subscription.endpoint);
		} catch (error) {
			failed.push({
				endpoint: subscription.endpoint,
				error
			});
		}
	};
	const queue = subscriptions.values();
	const worker = async () => {
		for (const subscription of queue) {
			if (sendOptions.signal?.aborted) return;
			await sendOne(subscription);
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, subscriptions.length) }, worker));
	return {
		delivered,
		gone,
		failed
	};
};
//#endregion


/* ======================= fin de la librería empaquetada ======================= */

async function callSupabaseRpc_(env, fnName, args) {
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/' + fnName, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  return res;
}

// CORS: la app vive en un dominio (Cloudflare Pages) y este Worker en otro
// (workers.dev) -- sin estos headers, el navegador bloquea la respuesta antes de que el
// JS de la app pueda leerla, y el fetch() falla con un error genérico ("Load failed" en
// Safari, "Failed to fetch" en Chrome) sin ningún detalle útil. `*` es seguro acá: este
// endpoint no depende de cookies/sesión de navegador para autenticarse, solo del
// household_id + token que van en el cuerpo del POST.
const CORS_HEADERS_ = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonResponse_(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS_)
  });
}

async function handleNotify_(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse_({ error: 'JSON inválido' }, 400);
  }
  const householdId = body && body.household_id;
  const token = body && body.token;
  const title = body && body.title;
  if (!householdId || !token || !title) {
    return jsonResponse_({ error: 'Faltan household_id, token o title' }, 400);
  }

  const subsRes = await callSupabaseRpc_(env, 'obtener_suscripciones_push', {
    p_household_id: householdId, p_token: token
  });
  if (!subsRes.ok) {
    const detail = await subsRes.text();
    return jsonResponse_({ error: 'No se pudo validar el hogar/código de importación', detail: detail }, 401);
  }
  const subs = await subsRes.json();
  if (!Array.isArray(subs) || subs.length === 0) {
    return jsonResponse_({ delivered: 0, gone: 0, failed: 0, note: 'Sin dispositivos suscritos a notificaciones en este hogar todavía.' });
  }

  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY
  };
  const payload = { title: title, body: body.message || '', url: body.url || '/' };
  const subscriptions = subs.map(function(s){
    return { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
  });

  const result = await sendPushBatch(subscriptions, payload, vapid);

  // limpiar del lado de Supabase cualquier suscripción que el navegador ya dio de baja
  for (const endpoint of result.gone) {
    await callSupabaseRpc_(env, 'eliminar_suscripcion_push', {
      p_household_id: householdId, p_token: token, p_endpoint: endpoint
    }).catch(function(){});
  }

  return jsonResponse_({ delivered: result.delivered, gone: result.gone.length, failed: result.failed.length });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // El navegador manda esta petición "de prueba" ANTES del POST real, para preguntar si
    // tiene permiso -- sin responderla con los headers de CORS, el POST real nunca llega a
    // salir del navegador.
    if (request.method === 'OPTIONS' && url.pathname === '/notify') {
      return new Response(null, { status: 204, headers: CORS_HEADERS_ });
    }
    if (request.method === 'POST' && url.pathname === '/notify') {
      try {
        return await handleNotify_(request, env);
      } catch (err) {
        return jsonResponse_({ error: String(err && err.message || err) }, 500);
      }
    }
    return new Response('Plata Clara — servicio de notificaciones push. Nada que ver por acá directamente.', { status: 200, headers: CORS_HEADERS_ });
  }
};
