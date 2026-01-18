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

// Chat types
export interface DecisionContext {
    decisionId: string;
    title: string;
    summary: string;
    meetingType: string;
    meetingDate: string;
    location: [number, number] | null;
}

export interface DateRangeContext {
    startDate: string | null;
    endDate: string | null;
}

export interface SuggestedDateRange {
    startDate: string;
    endDate: string;
    reason: string;
}

export interface ChatRequest {
    message: string;
    decisions: DecisionContext[];
    difficultyLevel?: 'simple' | 'detailed';
    currentDateRange?: DateRangeContext;
}

export interface ChatResponse {
    answer: string;
    references: string[]; // Array of decisionIds
    suggestedDateRange?: SuggestedDateRange;
}
