import { Collection, MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

export interface MongoUser {
  _id?: ObjectId;
  firstName: string;
  lastName: string;
  id: string;
  password: string;
  createdDate: Date;
  isActive: boolean;
  tenantId: string;
}

let client: MongoClient | null = null;
let users: Collection<MongoUser> | null = null;

function getTenantId(): string {
  const tenantId = (process.env.TENANT_ID ?? "default-tenant").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantId) || tenantId.length > 48) {
    throw new Error("TENANT_ID must use lowercase letters, numbers, and hyphens, with a maximum length of 48.");
  }
  return tenantId;
}

async function getUsersCollection(): Promise<Collection<MongoUser>> {
  if (users) return users;
  const configuredUri = process.env.MONGODB_URI;
  if (!configuredUri) throw new Error("MONGODB_URI is required when AUTH_STORE=mongo.");
  let uri = configuredUri;
  const directHosts = process.env.MONGODB_DIRECT_HOSTS?.trim();
  if (process.env.MONGODB_DIRECT_CONNECTION === "true" && directHosts && configuredUri.startsWith("mongodb+srv://")) {
    uri = configuredUri.replace(/^mongodb\+srv:\/\/([^@]+)@[^/]+/, `mongodb://$1@${directHosts}`);
    const options = [
      !/[?&]tls=/.test(uri) ? "tls=true" : "",
      process.env.MONGODB_REPLICA_SET && !/[?&]replicaSet=/.test(uri)
        ? `replicaSet=${process.env.MONGODB_REPLICA_SET}`
        : "",
    ].filter(Boolean);
    if (options.length) uri += `${uri.includes("?") ? "&" : "?"}${options.join("&")}`;
  }
  client = new MongoClient(uri, {
    // Fail quickly when Atlas DNS/network access is unavailable instead of
    // holding the registration request open for the driver's long default.
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  await client.connect();
  const database = client.db(process.env.MONGODB_DB_NAME ?? "uiquality_dev");
  users = database.collection<MongoUser>(process.env.MONGODB_USERS_COLLECTION ?? "signIn");
  await users.createIndex({ id: 1 }, { unique: true });
  return users;
}

export async function findMongoUserByEmail(email: string): Promise<MongoUser | null> {
  return (await getUsersCollection()).findOne({ id: email.trim().toLowerCase() });
}

export async function createMongoUser(input: { firstName: string; lastName: string; email: string; password: string }): Promise<MongoUser> {
  const collection = await getUsersCollection();
  const email = input.email.trim().toLowerCase();
  const user: MongoUser = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    id: email,
    password: await bcrypt.hash(input.password, 10),
    createdDate: new Date(),
    isActive: true,
    tenantId: getTenantId(),
  };
  const result = await collection.insertOne(user);
  return { ...user, _id: result.insertedId };
}

export async function getMongoUserById(id: string): Promise<MongoUser | null> {
  return (await getUsersCollection()).findOne({ id: id.trim().toLowerCase() });
}

export async function verifyMongoPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
