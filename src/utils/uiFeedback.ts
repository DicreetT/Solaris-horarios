const SUCCESS_EVENT = 'lunaris:success';

export const emitSuccessFeedback = (message: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
        new CustomEvent(SUCCESS_EVENT, {
            detail: {
                message,
            },
        }),
    );
};

export const successFeedbackEventName = SUCCESS_EVENT;

