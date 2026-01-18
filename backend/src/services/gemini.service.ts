import { GoogleGenerativeAI } from '@google/generative-ai';
import type { MeetingDecision } from '../types/gemini.js';

export class GeminiService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string' },
                            content: { type: 'string' },
                            location: {
                                type: 'array',
                                items: { type: 'number' },
                                nullable: true
                            },
                            summary: { type: 'string' }
                        },
                        required: ['title', 'content', 'location', 'summary']
                    }
                }
            }
        });
    }

    private makePrompt(meetingMinutes: string): string {
        return `
        You are a smart summarization program for council meeting decisions. Extract all of the meeting decisions given the council meeting minutes as plain text and output a JSON containing the decisions formatted as described below.

        Format to write the JSON in:
        {
            "title": string,
            "content": string,
            "location": [number, number] | null,
            "summary": string
        }

        The title must be understandable in layman language. The location, if it exists, must be included as a latitude and a longitude.

        For example, given the following text:
        THAT Council authorize City staff to negotiate to the satisfaction of the City's
        Chief Human Resources Officer, City's Director of Legal Services, and the City's
        Chief Procurement Officer and enter into a contract with Homewood Health Inc.
        ("HHI") under which HHI will provide Employee and Family Assistance Plan
        services for an initial term of (3) three-years with an estimated contract value of
        $1,122,076 plus applicable taxes, with the option to extend for (6) six additional
        (1) one- year terms, with an estimated contract value of $3,570,983, plus
        applicable taxes over the entire term of the contract to be funded through the
        operating budget

        You would output:
        {
            "title": "Decision on the contract with Homewood Health Inc.",
            "content": "THAT Council authorize City staff to negotiate to the satisfaction of the City's
        Chief Human Resources Officer, City's Director of Legal Services, and the City's
        Chief Procurement Officer and enter into a contract with Homewood Health Inc.
        ("HHI") under which HHI will provide Employee and Family Assistance Plan
        services for an initial term of (3) three-years with an estimated contract value of
        $1,122,076 plus applicable taxes, with the option to extend for (6) six additional
        (1) one- year terms, with an estimated contract value of $3,570,983, plus
        applicable taxes over the entire term of the contract to be funded through the
        operating budget",
            "location": null,
            "summary": "The City Council is going to start negotiations for a multi-year contract with Homewood Health Inc. to provide Employee and Family Assistance Plan services, with options to extend, funded through the city's operating budget."
        }

        Extract all of the meeting decisions in the following text:
        ${meetingMinutes}
    `;
    }

    async extractMeetingDecisions(meetingMinutes: string): Promise<MeetingDecision[]> {
        if (!meetingMinutes || typeof meetingMinutes !== 'string' || meetingMinutes.trim() === '') {
            throw new Error('Please provide valid meeting minutes text');
        }

        const prompt = this.makePrompt(meetingMinutes);
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse the JSON response
        const decisions: MeetingDecision[] = JSON.parse(text);
        return decisions;
    }
}
