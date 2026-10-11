import { prisma } from './database';

export function toId(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (val._id) return typeof val._id === 'string' ? val._id : val._id.toString();
  if (val.id) return typeof val.id === 'string' ? val.id : val.id.toString();
  if (typeof val.toString === 'function') return val.toString();
  return String(val);
}

export class ObjectIdCompat {
  private __idStr: string;
  [key: string]: any;

  constructor(id?: any) {
    this.__idStr = toId(id) || Math.random().toString(36).substring(2, 10);
  }
  toString() {
    return this.__idStr;
  }
  valueOf() {
    return this.__idStr;
  }
  [Symbol.toPrimitive](hint: string) {
    if (hint === 'number') return NaN;
    return this.__idStr;
  }
  toJSON() {
    const keys = Object.keys(this).filter((k) => k !== '__idStr');
    if (keys.length > 0) {
      const obj: any = {};
      for (const k of keys) {
        obj[k] = (this as any)[k];
      }
      return obj;
    }
    return this.__idStr;
  }
  static isValid(id: any): boolean {
    if (!id) return false;
    const s = typeof id === 'string' ? id : typeof id.toString === 'function' ? id.toString() : '';
    return typeof s === 'string' && s.trim().length > 0;
  }
}

export function createPopulatedRef(id: any, populated?: any): any {
  const idStr = toId(id) || (populated ? toId(populated) : '');
  if (!idStr) return undefined;
  const ref = new ObjectIdCompat(idStr);
  if (populated && typeof populated === 'object') {
    Object.assign(ref, populated, { _id: idStr, id: idStr });
  }
  return ref;
}

export type ObjectId = string | ObjectIdCompat;
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Types {
  export type ObjectId = string | ObjectIdCompat;
  export const ObjectId = ObjectIdCompat;
}

export const connection = {
  async transaction<T>(fn: (session: any) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      return fn(tx);
    });
  },
};

/**
 * Base document proxy providing MongoDB-compatible properties:
 * - ._id (equals .id)
 * - .id
 * - .save() (persists changes to PostgreSQL via Prisma)
 */
export function createDocProxy<T extends Record<string, any>>(
  data: T,
  saveFn: (current: T) => Promise<any>
): T & { _id: any; save: (opts?: any) => Promise<any> } {
  const handler: ProxyHandler<any> = {
    get(target, prop, receiver) {
      if (prop === '_id') {
        return target.id || target._id;
      }
      if (prop === 'save') {
        return async () => {
          const res = await saveFn(target);
          if (res && typeof res === 'object') {
            Object.assign(target, res);
          }
          return receiver;
        };
      }
      if (prop === 'session') {
        return () => receiver;
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (prop === '_id') {
        target.id = toId(value);
      }
      return Reflect.set(target, prop, value, receiver);
    },
  };

  return new Proxy({ ...data, _id: data.id }, handler);
}

/**
 * Single document query builder that supports `.session()`, `.sort()`, `.select()`, `.orFail()`
 */
export class SingleQueryBuilder<T = any> implements PromiseLike<T | null> {
  private fetcher: (opts: { sort?: any; select?: any }) => Promise<T | null>;
  private sortOption?: any;
  private selectOption?: any;

  constructor(fetcher: (opts: { sort?: any; select?: any }) => Promise<T | null>) {
    this.fetcher = fetcher;
  }

  session(s: any): this {
    return this;
  }

  sort(s: any): this {
    this.sortOption = s;
    return this;
  }

  select(s: any): this {
    this.selectOption = s;
    return this;
  }

  populate(path: any, select?: any): this {
    return this;
  }

  lean(): this {
    return this;
  }

  async orFail(err?: any): Promise<T> {
    const res = await this.exec();
    if (!res) {
      throw err || new Error('Document not found');
    }
    return res;
  }

  async exec(): Promise<T | null> {
    return this.fetcher({ sort: this.sortOption, select: this.selectOption });
  }

  then<TResult1 = T | null, TResult2 = never>(
    onfulfilled?: ((value: T | null) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

/**
 * Chainable query builder for find() operations that supports:
 * .populate(), .sort(), .select(), .limit(), .lean(), .session(), and thenable/awaitable
 */
export class QueryBuilder<T = any> implements PromiseLike<T[]> {
  private fetcher: (options: {
    sort?: any;
    select?: any;
    populate?: string[];
    limit?: number;
  }) => Promise<T[]>;
  private sortOption?: any;
  private selectOption?: any;
  private populateOptions: string[] = [];
  private limitOption?: number;

  constructor(fetcher: (opts: any) => Promise<T[]>) {
    this.fetcher = fetcher;
  }

  sort(s: any): this {
    this.sortOption = s;
    return this;
  }

  select(s: any): this {
    this.selectOption = s;
    return this;
  }

  populate(path: string | any, select?: string): this {
    if (typeof path === 'string') {
      this.populateOptions.push(path);
    } else if (path && path.path) {
      this.populateOptions.push(path.path);
    }
    return this;
  }

  limit(l: number): this {
    this.limitOption = l;
    return this;
  }

  lean(): this {
    return this;
  }

  session(s: any): this {
    return this;
  }

  async exec(): Promise<T[]> {
    return this.fetcher({
      sort: this.sortOption,
      select: this.selectOption,
      populate: this.populateOptions,
      limit: this.limitOption,
    });
  }

  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}
