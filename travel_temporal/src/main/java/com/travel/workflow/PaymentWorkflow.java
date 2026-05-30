package com.travel.workflow;

import com.travel.dto.TravelRequest;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;

@WorkflowInterface
public interface PaymentWorkflow {

    @WorkflowMethod
    void processPayment(TravelRequest travelRequest, double amount);
}
