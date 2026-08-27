import { Todo } from '../types';

export type OperationalControlTaskTarget = {
    process: string;
    year: number;
    month: number;
};

const OPERATIONAL_CONTROL_TAG_PREFIX = 'control-operativo:';

export function makeOperationalControlTag(process: string, year: number, month: number) {
    return `${OPERATIONAL_CONTROL_TAG_PREFIX}${process}:${year}:${month}`;
}

export function isHiddenTaskTag(tag: string) {
    return tag.startsWith(OPERATIONAL_CONTROL_TAG_PREFIX);
}

export function parseOperationalControlTask(task: Pick<Todo, 'tags'> | null | undefined): OperationalControlTaskTarget | null {
    const tag = (task?.tags || []).find((item) => item.startsWith(OPERATIONAL_CONTROL_TAG_PREFIX));
    if (!tag) return null;

    const [, process, yearRaw, monthRaw] = tag.split(':');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!process || !Number.isFinite(year) || !Number.isFinite(month)) return null;

    return { process, year, month };
}

export function getOperationalControlUrl(target: OperationalControlTaskTarget) {
    const params = new URLSearchParams({
        process: target.process,
        year: String(target.year),
        month: String(target.month),
        focus: '1',
    });
    return `/control-operativo?${params.toString()}`;
}
