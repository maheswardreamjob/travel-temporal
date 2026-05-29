package com.travel.workflow;

import com.travel.dto.TravelRequest;
import io.temporal.workflow.QueryMethod;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;

@WorkflowInterface
public interface TravelWorkflow {

    @WorkflowMethod
    void bookTrip(TravelRequest travelRequest);


    @SignalMethod
    public void sendConfirmationSignal();

    @SignalMethod
    public void sendCancellationSignal();

    @QueryMethod
    String getStatus();

}
