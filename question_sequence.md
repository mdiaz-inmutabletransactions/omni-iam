# Chronological Question Sequence

1. **Initial Request**  
   "I'm going to start coding an Ory Kratos enabled app so create a server file where I will start developing the Kratos API consuming code"

2. **First Follow-up**  
   "Add correlation ID for request header and set-correlation-id for response"

3. **Header Clarification**  
   "Is the response having the Set-Correlation-ID, is the same idea as cookie and set-cookie"

4. **Tracing Integration**  
   "Is the span using the correlation-id?"

5. **Failure Handling**  
   "What happens if the tracing system is not healthy despite the TELEMETRY_ENABLED === 'true'"

6. **Resilience Enhancement**  
   "Any other that can be added to make better availability, resilient, and sure recoverable?"

7. **Documentation Request**  
   "Create a technical implementation readme.md that includes all implemented features of logging, observability, availability, resilience, recoverability, etc"

8. **Commit Message**  
   "Generate a commit message"

9. **Commit Execution**  
   "Generate a commit with this message"

10. **Knowledge Transfer**  
    "Create a chat context text file with all the work done and relevant context for using as initial context on this work for another new chat that has no context"

11. **Transcript Request**  
    "Give me a structured document in md that captures all question and answers in this chat"

12. **Verification**  
    "Can you get the full questions I made from your context?"

13. **Format Request**  
    "Do it in order of question creation and not grouped by intention"
