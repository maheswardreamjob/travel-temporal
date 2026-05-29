package com.travel.starter;

import com.travel.dto.TravelRequest;
import com.travel.workflow.TravelWorkflow;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowOptions;
import io.temporal.serviceclient.WorkflowServiceStubs;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class TravelBookingWorkflowStarter {

    @Autowired
    private WorkflowServiceStubs serviceStubs;


    public void startWorkFlow(TravelRequest travelRequest){
        WorkflowClient client = WorkflowClient.newInstance(serviceStubs);

        TravelWorkflow workflow = client.newWorkflowStub(
                TravelWorkflow.class,
                WorkflowOptions.newBuilder()
                        .setTaskQueue("TRAVEL_TASK_QUEUE")
                        .setWorkflowId("travel_" + travelRequest.getUserId())
                        .build()
        );

        WorkflowClient.start(workflow::bookTrip, travelRequest);
    }


    public void sendConfirmationSignal(String userId) {
        WorkflowClient client = WorkflowClient.newInstance(serviceStubs);

        String workflowId = "travel_" + userId;
        TravelWorkflow workflow = client.newWorkflowStub(TravelWorkflow.class, workflowId);

        workflow.sendConfirmationSignal();
    }

    public void sendCancellationSignal(String userId) {
        WorkflowClient client = WorkflowClient.newInstance(serviceStubs);

        String workflowId = "travel_" + userId;
        TravelWorkflow workflow = client.newWorkflowStub(TravelWorkflow.class, workflowId);

        workflow.sendCancellationSignal();
    }

    public String getWorkflowStatus(String userId) {
        WorkflowClient client = WorkflowClient.newInstance(serviceStubs);
        String workflowId = "travel_" + userId;
        try {
            TravelWorkflow workflow = client.newWorkflowStub(TravelWorkflow.class, workflowId);
            return workflow.getStatus();
        } catch (Exception e) {
            return "NOT_FOUND";
        }
    }
}
