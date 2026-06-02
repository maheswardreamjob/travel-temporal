package com.travel.config;

import com.travel.activities.PaymentActivities;
import com.travel.activities.TravelActivities;
import com.travel.activities.AiAdvisoryActivities;
import com.travel.workflow.PaymentWorkflowImpl;
import com.travel.workflow.TravelWorkflowImpl;
import io.temporal.client.WorkflowClient;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.worker.Worker;
import io.temporal.worker.WorkerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Configuration
public class TemporalConfig {

    @Autowired
    private TravelActivities travelActivities;

    @Autowired
    private PaymentActivities paymentActivities;

    @Autowired
    private AiAdvisoryActivities aiAdvisoryActivities;

    /**
     * Provides a WorkflowServiceStubs bean for connecting to the Temporal service.
     */
    @Bean
    public WorkflowServiceStubs serviceStubs() {
        return WorkflowServiceStubs.newInstance();
    }

    /**
     * Provides a shared, thread-safe WorkflowClient bean.
     */
    @Bean
    public WorkflowClient workflowClient(WorkflowServiceStubs serviceStubs) {
        return WorkflowClient.newInstance(serviceStubs);
    }

    /**
     * Creates and configures a WorkerFactory for Temporal workflows.
     * Registers the TravelWorkflow and its activities to the specified task queue.
     */
    @Bean
    public WorkerFactory workerFactory(WorkflowClient workflowClient) {
        WorkerFactory factory = WorkerFactory.newInstance(workflowClient);

        Worker worker = factory.newWorker("TRAVEL_TASK_QUEUE");
        worker.registerWorkflowImplementationTypes(TravelWorkflowImpl.class, PaymentWorkflowImpl.class);
        worker.registerActivitiesImplementations(travelActivities, paymentActivities, aiAdvisoryActivities);

        return factory;
    }

    /**
     * Helper component to start the Temporal workers after Spring context is fully refreshed.
     * This avoids any circular reference/autowiring issues during config loading.
     */
    @Component
    public static class TemporalWorkerInitializer {

        private final WorkerFactory workerFactory;

        public TemporalWorkerInitializer(WorkerFactory workerFactory) {
            this.workerFactory = workerFactory;
        }

        @EventListener(ContextRefreshedEvent.class)
        public void startWorkers() {
            workerFactory.start();
        }
    }
}

