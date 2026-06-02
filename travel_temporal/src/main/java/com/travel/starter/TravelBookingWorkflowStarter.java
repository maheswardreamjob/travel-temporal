package com.travel.starter;

import com.travel.dto.TravelRequest;
import com.travel.workflow.TravelWorkflow;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class TravelBookingWorkflowStarter {

    @Autowired
    private WorkflowClient workflowClient;

    public String startWorkFlow(TravelRequest travelRequest){
        TravelWorkflow workflow = workflowClient.newWorkflowStub(
                TravelWorkflow.class,
                WorkflowOptions.newBuilder()
                        .setTaskQueue("TRAVEL_TASK_QUEUE")
                        .setWorkflowId("travel_" + travelRequest.getUserId())
                        .build()
        );

        io.temporal.api.common.v1.WorkflowExecution execution = WorkflowClient.start(workflow::bookTrip, travelRequest);
        return execution.getRunId();
    }

    public void sendConfirmationSignal(String userId) {
        String workflowId = "travel_" + userId;
        TravelWorkflow workflow = workflowClient.newWorkflowStub(TravelWorkflow.class, workflowId);

        workflow.sendConfirmationSignal();
    }

    public void sendCancellationSignal(String userId) {
        String workflowId = "travel_" + userId;
        TravelWorkflow workflow = workflowClient.newWorkflowStub(TravelWorkflow.class, workflowId);

        workflow.sendCancellationSignal();
    }

    public String getWorkflowStatus(String userId) {
        String workflowId = "travel_" + userId;
        try {
            TravelWorkflow workflow = workflowClient.newWorkflowStub(TravelWorkflow.class, workflowId);
            return workflow.getStatus();
        } catch (Exception e) {
            return "NOT_FOUND";
        }
    }
}

