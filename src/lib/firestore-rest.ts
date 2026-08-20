/**
 * Fast Firestore REST API client for serverless Next.js and Node.js
 * Avoids WebChannel/gRPC connection hangs in serverless runtimes.
 */

const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  "laboveda-b3a1b";

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function encodeValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: val.toString() };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeValue) } };
  }
  if (typeof val === "object") {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = encodeValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function decodeValue(valObj: any): any {
  if (!valObj) return null;
  if ("stringValue" in valObj) return valObj.stringValue;
  if ("integerValue" in valObj) return parseInt(valObj.integerValue, 10);
  if ("doubleValue" in valObj) return valObj.doubleValue;
  if ("booleanValue" in valObj) return valObj.booleanValue;
  if ("nullValue" in valObj) return null;
  if ("arrayValue" in valObj) {
    return (valObj.arrayValue.values || []).map(decodeValue);
  }
  if ("mapValue" in valObj) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(valObj.mapValue.fields || {})) {
      res[k] = decodeValue(v);
    }
    return res;
  }
  return null;
}

export async function restGetClasses(userId: string) {
  const url = `${BASE_URL}/users/${encodeURIComponent(userId)}/tutorClasses`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 404) return [];
  if (!res.ok) {
    const txt = await res.text();
    console.error("Firestore REST get error:", res.status, txt);
    return [];
  }

  const data = (await res.json()) as any;
  const docs = data.documents || [];
  return docs.map((d: any) => {
    const id = d.name.split("/").pop();
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(d.fields || {})) {
      fields[k] = decodeValue(v);
    }
    return { id, ...fields };
  });
}

export async function restAddClass(userId: string, payload: Record<string, any>) {
  const url = `${BASE_URL}/users/${encodeURIComponent(userId)}/tutorClasses`;
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined) {
      fields[k] = encodeValue(v);
    }
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore REST add error (${res.status}): ${txt}`);
  }

  const doc = (await res.json()) as any;
  const id = doc.name.split("/").pop();
  return id;
}

export async function restUpdateClass(
  userId: string,
  classId: string,
  updates: Record<string, any>
) {
  const fields: Record<string, any> = {};
  const updateMask: string[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) {
      fields[k] = encodeValue(v);
      updateMask.push(k);
    }
  }

  const maskQuery = updateMask.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join("&");
  const url = `${BASE_URL}/users/${encodeURIComponent(userId)}/tutorClasses/${encodeURIComponent(classId)}?${maskQuery}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore REST update error (${res.status}): ${txt}`);
  }

  return true;
}

export async function restDeleteClass(userId: string, classId: string) {
  const url = `${BASE_URL}/users/${encodeURIComponent(userId)}/tutorClasses/${encodeURIComponent(classId)}`;
  const res = await fetch(url, { method: "DELETE" });
  return res.ok;
}
