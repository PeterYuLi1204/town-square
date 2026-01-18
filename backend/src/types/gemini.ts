export interface MeetingDecision {
    title: string;
    content: string;
    location: [number, number] | null;
    summary: string;
}

export interface PromptRequest {
    prompt: string;
}

export interface PromptResponse {
    success: true;
    decisions: MeetingDecision[];
}
